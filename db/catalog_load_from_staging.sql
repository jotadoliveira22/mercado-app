-- ============================================================================
-- MarktPlan — Cargar el catálogo desde la tabla temporal `catalog_staging`
--
-- Este es el camino SIN terminal: se sube un CSV plano con el importador de
-- Supabase y este script lo reparte en las 4 tablas definitivas.
--
-- ORDEN:
--   1. Ejecutar la PARTE 1 (crea catalog_staging, vacía).
--   2. Table Editor → catalog_staging → Insert → Import data from CSV
--      → subir catalogo_marktplan.csv
--   3. Ejecutar la PARTE 2 (reparte los datos).
--   4. Ejecutar la PARTE 3 (verificar) y la PARTE 4 (limpiar).
--
-- Idempotente: correrlo dos veces no duplica nada.
-- ============================================================================


-- ── PARTE 1 · Crear la tabla temporal ───────────────────────────────────────
-- Todo entra como texto: así ninguna fila se rechaza por formato durante la
-- subida. La conversión de tipos se hace en la PARTE 2, ya dentro de la base.

DROP TABLE IF EXISTS public.catalog_staging;

CREATE TABLE public.catalog_staging (
  retailer_id         text,
  retailer_nombre     text,
  branch_id           text,
  branch_nombre       text,
  fuente_url          text,
  clave_fuente        text,
  sku                 text,
  id_producto_web     text,
  nombre              text,
  nombre_normalizado  text,
  presentacion        text,
  categoria_fuente    text,
  categoria_estandar  text,
  categoria_app       text,
  url_producto        text,
  url_imagen          text,
  precio_usd          text,
  precio_regular      text,
  precio_oferta       text,
  descuento_pct       text,
  moneda_fuente       text,
  disponible          text,
  estado_stock        text,
  calidad             text,
  observaciones       text,
  fecha_extraccion    text
);

-- RLS activo y sin políticas: nadie puede leerla con la anon key ni con una
-- sesión de usuario. La subida del CSV desde el Table Editor sigue funcionando
-- porque corre como `postgres`, dueño de la tabla, y en Postgres el dueño no
-- queda sujeto a sus propias políticas.
--
-- Aunque la tabla sea de paso, dejarla sin RLS abriría el mismo agujero que se
-- cerró en db/rls_policies.sql.
ALTER TABLE public.catalog_staging ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- ⬆️  DETENTE AQUÍ. Sube el CSV antes de continuar.
--     Table Editor → catalog_staging → Insert → Import data from CSV
-- ============================================================================


-- ── PARTE 2 · Repartir en las tablas definitivas ────────────────────────────
-- Ejecutar SOLO después de subir el CSV.

/*

-- 2.1 Cadenas
INSERT INTO public.catalog_retailers (id, nombre, app_store_name, activo)
SELECT DISTINCT retailer_id, retailer_nombre, retailer_nombre, true
FROM public.catalog_staging
WHERE retailer_id IS NOT NULL
ON CONFLICT (id) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      app_store_name = EXCLUDED.app_store_name;

-- 2.2 Sucursales
INSERT INTO public.catalog_branches (id, retailer_id, nombre, fuente_url)
SELECT DISTINCT ON (branch_id) branch_id, retailer_id, branch_nombre, fuente_url
FROM public.catalog_staging
WHERE branch_id IS NOT NULL
ORDER BY branch_id
ON CONFLICT (id) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      fuente_url = EXCLUDED.fuente_url;

-- 2.3 Productos (registro de SKU)
-- DISTINCT ON colapsa el mismo producto repetido entre sucursales.
INSERT INTO public.catalog_products (
  retailer_id, clave_fuente, sku, id_producto_web, nombre, nombre_normalizado,
  presentacion, categoria_fuente, categoria_estandar, categoria_app,
  url_producto, url_imagen
)
SELECT DISTINCT ON (retailer_id, clave_fuente)
  retailer_id, clave_fuente, sku, id_producto_web, nombre, nombre_normalizado,
  presentacion, categoria_fuente, categoria_estandar, categoria_app,
  url_producto, url_imagen
FROM public.catalog_staging
WHERE clave_fuente IS NOT NULL AND nombre IS NOT NULL
ORDER BY retailer_id, clave_fuente
ON CONFLICT (retailer_id, clave_fuente) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      nombre_normalizado = EXCLUDED.nombre_normalizado,
      presentacion = EXCLUDED.presentacion,
      categoria_app = EXCLUDED.categoria_app,
      url_producto = EXCLUDED.url_producto,
      url_imagen = EXCLUDED.url_imagen,
      actualizado_en = now();

-- 2.4 Precios
-- Se resuelve product_id uniendo por (retailer_id, clave_fuente), y se
-- convierten los textos a sus tipos reales.
INSERT INTO public.catalog_prices (
  product_id, branch_id, precio_usd, precio_regular, precio_oferta,
  descuento_pct, moneda_fuente, disponible, estado_stock, calidad,
  observaciones, fecha_extraccion
)
SELECT DISTINCT ON (p.id, s.branch_id, s.fecha_extraccion::timestamptz)
  p.id,
  s.branch_id,
  s.precio_usd::numeric,
  NULLIF(s.precio_regular, '')::numeric,
  NULLIF(s.precio_oferta, '')::numeric,
  NULLIF(s.descuento_pct, '')::numeric,
  NULLIF(s.moneda_fuente, ''),
  NULLIF(s.disponible, '')::boolean,
  NULLIF(s.estado_stock, ''),
  NULLIF(s.calidad, ''),
  NULLIF(s.observaciones, ''),
  s.fecha_extraccion::timestamptz
FROM public.catalog_staging s
JOIN public.catalog_products p
  ON p.retailer_id = s.retailer_id AND p.clave_fuente = s.clave_fuente
WHERE s.precio_usd IS NOT NULL
  AND s.precio_usd <> ''
  AND s.precio_usd::numeric > 0
  AND s.fecha_extraccion IS NOT NULL
ORDER BY p.id, s.branch_id, s.fecha_extraccion::timestamptz
ON CONFLICT (product_id, branch_id, fecha_extraccion) DO UPDATE
  SET precio_usd = EXCLUDED.precio_usd,
      disponible = EXCLUDED.disponible,
      calidad = EXCLUDED.calidad;

*/


-- ── PARTE 3 · Verificar ─────────────────────────────────────────────────────
/*

SELECT r.nombre AS cadena,
       count(DISTINCT p.id) AS productos,
       count(pr.id) AS precios
FROM public.catalog_retailers r
LEFT JOIN public.catalog_products p ON p.retailer_id = r.id
LEFT JOIN public.catalog_prices pr  ON pr.product_id = p.id
GROUP BY r.nombre
ORDER BY productos DESC;

-- Esperado:
--   Central Madeirense   4989   8396
--   Automercados Plaza     745    745
--   Luvebras               111    111
--   Unicasa                105    105

-- La comparativa funcionando:
SELECT store, nombre, precio_usd
FROM public.catalog_precio_vigente
WHERE nombre_normalizado LIKE '%harina pan%'
ORDER BY precio_usd
LIMIT 8;

*/


-- ── PARTE 4 · Limpiar ───────────────────────────────────────────────────────
-- Solo después de verificar. La tabla temporal ya no hace falta y ocupa
-- espacio del plan gratuito.
/*

DROP TABLE IF EXISTS public.catalog_staging;

*/
