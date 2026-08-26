-- ============================================================================
-- MarktPlan — Exponer la foto del producto en el catálogo
--
-- Pegar y ejecutar en: Supabase → SQL Editor → New query → Run
-- Idempotente: correrlo dos veces no cambia nada la segunda vez.
--
-- catalog_products.url_imagen ya se viene guardando desde la primera
-- importación (viene de la misma fuente que el nombre y el precio), pero la
-- vista que usa la app no la exponía. Este cambio solo agrega esa columna a
-- la vista; no toca datos.
-- ============================================================================

-- Postgres no permite insertar una columna en medio de una vista existente
-- con CREATE OR REPLACE (solo agregar al final); por eso url_imagen va
-- después de fecha_extraccion y no junto a categoria_app como en
-- catalog_schema.sql, que sí crea la vista desde cero.
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
  pr.precio_usd,
  pr.disponible,
  pr.calidad,
  b.nombre            AS sucursal,
  pr.fecha_extraccion,
  p.url_imagen
FROM public.catalog_products p
JOIN public.catalog_retailers r ON r.id = p.retailer_id
JOIN public.catalog_prices  pr ON pr.product_id = p.id
JOIN public.catalog_branches b  ON b.id = pr.branch_id
WHERE r.activo
ORDER BY p.id, pr.fecha_extraccion DESC, pr.precio_usd ASC;
