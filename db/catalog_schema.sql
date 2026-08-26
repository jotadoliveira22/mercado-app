-- ============================================================================
-- MarktPlan — Catálogo de precios de supermercados (PROPUESTA)
--
-- Estructura para importar "Base_precios_supermercados_v4.xlsx":
-- 11.743 filas · 4 cadenas · 7 sucursales · 9.357 filas utilizables.
--
-- Se mantiene SEPARADA de `store_prices` a propósito:
--   · `catalog_*`      → datos extraídos de los sitios de los supermercados.
--                        Reemplazables en cada corrida del extractor.
--   · `store_prices`   → precios aportados por los usuarios de la app.
--                        Nunca deben ser sobrescritos por una importación.
--
-- Mezclarlas en una sola tabla haría que el próximo scrape borrara lo que
-- aportaron los usuarios, y perdería el rastro de dónde vino cada precio.
-- ============================================================================


-- ── 1. Cadenas y sucursales ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_retailers (
  id              text PRIMARY KEY,        -- 'central-madeirense'
  nombre          text NOT NULL,           -- 'Central Madeirense'
  -- Nombre con el que la app muestra esta cadena en el selector de
  -- establecimiento. NULL = no se muestra todavía en la app.
  app_store_name  text,
  activo          boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.catalog_branches (
  id            text PRIMARY KEY,          -- 'central-madeirense:bello-monte-08'
  retailer_id   text NOT NULL REFERENCES public.catalog_retailers(id) ON DELETE CASCADE,
  nombre        text NOT NULL,             -- 'Bello Monte (08)'
  fuente_url    text
);

CREATE INDEX IF NOT EXISTS catalog_branches_retailer_idx
  ON public.catalog_branches (retailer_id);


-- ── 2. Registro de productos y SKU ──────────────────────────────────────────
--
-- Un producto por cadena. El SKU es el código COMERCIAL INTERNO del
-- supermercado (9-10 dígitos), NO un código de barras EAN: se verificó que
-- ninguno de los 11.218 SKU del archivo tiene forma de EAN/UPC. Por eso el
-- SKU sirve para reconocer el producto dentro de esa cadena, pero no para
-- cruzarlo entre cadenas ni con lo que escanea el usuario.
--
-- `barcode` queda vacío al importar y se va llenando con el tiempo (escaneos
-- de usuarios, Open Food Facts). Es el puente que hará exacto el cruce.

CREATE TABLE IF NOT EXISTS public.catalog_products (
  id                  bigserial PRIMARY KEY,
  retailer_id         text NOT NULL REFERENCES public.catalog_retailers(id) ON DELETE CASCADE,

  -- Identidad del producto dentro de la cadena: el SKU cuando la fuente lo
  -- expone, y si no, el nombre normalizado. 525 filas (PedidosYa) no traen SKU.
  clave_fuente        text NOT NULL,
  sku                 text,
  id_producto_web     text,

  nombre              text NOT NULL,
  nombre_normalizado  text NOT NULL,       -- minúsculas, sin acentos
  presentacion        text,

  categoria_fuente    text,                -- tal como la publica el sitio
  categoria_estandar  text,                -- taxonomía del archivo (10 valores)
  categoria_app       text,                -- una de las 22 categorías de la app

  barcode             text,                -- EAN real, cuando se conozca
  url_producto        text,
  url_imagen          text,

  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (retailer_id, clave_fuente)
);

CREATE INDEX IF NOT EXISTS catalog_products_nombre_idx
  ON public.catalog_products (nombre_normalizado);

CREATE INDEX IF NOT EXISTS catalog_products_barcode_idx
  ON public.catalog_products (barcode) WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS catalog_products_sku_idx
  ON public.catalog_products (retailer_id, sku) WHERE sku IS NOT NULL;

-- Búsqueda por texto para la Comparativa: es el modo que SÍ funciona sin
-- códigos de barras.
CREATE INDEX IF NOT EXISTS catalog_products_busqueda_idx
  ON public.catalog_products USING gin (to_tsvector('spanish', nombre));

-- Búsqueda por subcadena ("harina pan" dentro de "Harina Pan Gluten Free 1Kg").
-- Se comprobó que la coincidencia exacta de nombre da 0 resultados para toda
-- búsqueda realista, así que este índice es el que sostiene la Comparativa.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS catalog_products_trgm_idx
  ON public.catalog_products USING gin (nombre_normalizado gin_trgm_ops);


-- ── 3. Precios observados ───────────────────────────────────────────────────
--
-- Una fila por producto, sucursal y captura. Se conserva el histórico: es lo
-- que permite ver la variación de precios en el tiempo.
--
-- IMPORTANTE sobre la moneda: el archivo reporta `BSD` en 8.404 filas y `USD`
-- en 3.140, pero se comprobó que los valores están en la MISMA escala
-- ("Harina Pan Gluten Free 1Kg" = 1.35 en ambas). La etiqueta BSD de la fuente
-- es incorrecta. Se guarda `precio_usd` ya normalizado y `moneda_fuente` como
-- registro de lo que dijo el sitio, para poder auditarlo.

CREATE TABLE IF NOT EXISTS public.catalog_prices (
  id                bigserial PRIMARY KEY,
  product_id        bigint NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
  branch_id         text NOT NULL REFERENCES public.catalog_branches(id) ON DELETE CASCADE,

  precio_usd        numeric(12,2) NOT NULL CHECK (precio_usd > 0),
  precio_regular    numeric(12,2),
  precio_oferta     numeric(12,2),
  descuento_pct     numeric(5,2),
  moneda_fuente     text,                  -- 'BSD' | 'USD' | NULL, sin reinterpretar

  disponible        boolean,
  estado_stock      text,
  calidad           text,                  -- OK | RECUPERADO | REVISAR | PARCIAL
  observaciones     text,

  fecha_extraccion  timestamptz NOT NULL,
  importado_en      timestamptz NOT NULL DEFAULT now(),

  -- Una sola fila por producto/sucursal/captura: permite reimportar sin
  -- duplicar y conservar el histórico entre fechas distintas.
  UNIQUE (product_id, branch_id, fecha_extraccion)
);

CREATE INDEX IF NOT EXISTS catalog_prices_producto_idx
  ON public.catalog_prices (product_id, fecha_extraccion DESC);

CREATE INDEX IF NOT EXISTS catalog_prices_sucursal_idx
  ON public.catalog_prices (branch_id, fecha_extraccion DESC);


-- ── 4. Precio vigente por cadena ────────────────────────────────────────────
--
-- La app no maneja sucursales, y se verificó que solo 20 de 3.568 SKU (0,6%)
-- tienen precio distinto entre sucursales de la misma cadena. Así que se
-- expone el precio más reciente por cadena. La sucursal queda guardada para
-- poder exponerla más adelante sin volver a importar.

CREATE OR REPLACE VIEW public.catalog_precio_vigente AS
SELECT DISTINCT ON (p.id)
  p.id                AS product_id,
  p.retailer_id,
  r.app_store_name    AS store,
  p.sku,
  p.barcode,
  p.nombre,
  p.nombre_normalizado,
  p.presentacion,
  p.categoria_app,
  p.url_imagen,
  pr.precio_usd,
  pr.disponible,
  pr.calidad,
  b.nombre            AS sucursal,
  pr.fecha_extraccion
FROM public.catalog_products p
JOIN public.catalog_retailers r ON r.id = p.retailer_id
JOIN public.catalog_prices  pr ON pr.product_id = p.id
JOIN public.catalog_branches b  ON b.id = pr.branch_id
WHERE r.activo
ORDER BY p.id, pr.fecha_extraccion DESC, pr.precio_usd ASC;


-- ── 5. Seguridad ────────────────────────────────────────────────────────────
--
-- El catálogo es de lectura para los usuarios de la app. La escritura queda
-- reservada al importador, que corre con la service role key y salta RLS.

ALTER TABLE public.catalog_retailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_branches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_prices    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_retailers_read ON public.catalog_retailers;
CREATE POLICY catalog_retailers_read ON public.catalog_retailers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS catalog_branches_read ON public.catalog_branches;
CREATE POLICY catalog_branches_read ON public.catalog_branches
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS catalog_products_read ON public.catalog_products;
CREATE POLICY catalog_products_read ON public.catalog_products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS catalog_prices_read ON public.catalog_prices;
CREATE POLICY catalog_prices_read ON public.catalog_prices
  FOR SELECT TO authenticated USING (true);


-- ── 6. Verificación ─────────────────────────────────────────────────────────

-- SELECT r.nombre, count(DISTINCT p.id) AS productos, count(pr.id) AS precios
-- FROM catalog_retailers r
-- LEFT JOIN catalog_products p ON p.retailer_id = r.id
-- LEFT JOIN catalog_prices pr  ON pr.product_id = p.id
-- GROUP BY r.nombre ORDER BY productos DESC;
