-- ============================================================================
-- MarktPlan — Renombrar "Supermercado Gama" → "Gama"
--
-- Pegar y ejecutar en: Supabase → SQL Editor → New query → Run
-- Idempotente: correrlo dos veces no cambia nada la segunda vez.
--
-- IMPORTANTE: correr DESPUÉS de que el despliegue con el nuevo nombre esté
-- en producción (mismo orden que db/rename_el_plaza.sql). Si se corre antes,
-- la app en producción todavía buscaría "Supermercado Gama" y las filas
-- recién renombradas quedarían huérfanas hasta que el despliegue termine.
--
-- Por qué hace falta: el nombre del establecimiento se guarda como TEXTO en
-- store_prices.store y saved_purchases.store. Al renombrarlo en la app, las
-- filas existentes seguirían con el nombre viejo y quedarían huérfanas: sus
-- precios no aparecerían en la Comparativa y las compras guardadas mostrarían
-- un establecimiento que ya no existe en el selector.
-- ============================================================================

-- Cuántas filas se van a tocar. Correr ANTES para saber qué esperar.
-- SELECT 'store_prices' AS tabla, count(*) FROM public.store_prices
--   WHERE store = 'Supermercado Gama'
-- UNION ALL
-- SELECT 'saved_purchases', count(*) FROM public.saved_purchases
--   WHERE store = 'Supermercado Gama';


-- ── 1. Compras guardadas ────────────────────────────────────────────────────
-- Sin conflictos posibles: es solo una etiqueta descriptiva.

UPDATE public.saved_purchases
SET store = 'Gama'
WHERE store = 'Supermercado Gama';


-- ── 2. Precios de la comparativa ────────────────────────────────────────────
--
-- Aquí sí puede haber colisión: store_prices tiene un índice único en
-- (barcode, store). Si un producto ya tiene precio con AMBOS nombres, el
-- UPDATE fallaría por duplicado.
--
-- Se resuelve en dos pasos: primero se borran las filas viejas que ya tienen
-- equivalente con el nombre nuevo (el nuevo es más reciente y se conserva),
-- y después se renombran las que quedan.

DELETE FROM public.store_prices viejo
WHERE viejo.store = 'Supermercado Gama'
  AND EXISTS (
    SELECT 1 FROM public.store_prices nuevo
    WHERE nuevo.store = 'Gama'
      AND nuevo.barcode = viejo.barcode
  );

UPDATE public.store_prices
SET store = 'Gama'
WHERE store = 'Supermercado Gama';


-- ── 3. Catálogo (si ya se cargó con el nombre viejo) ────────────────────────

UPDATE public.catalog_prices
SET store = 'Gama'
WHERE store = 'Supermercado Gama';


-- ── 4. Verificación ─────────────────────────────────────────────────────────
-- Debe devolver 0 en todas las filas.

-- SELECT 'store_prices' AS tabla, count(*) AS quedan_con_nombre_viejo
-- FROM public.store_prices WHERE store = 'Supermercado Gama'
-- UNION ALL
-- SELECT 'saved_purchases', count(*)
-- FROM public.saved_purchases WHERE store = 'Supermercado Gama'
-- UNION ALL
-- SELECT 'catalog_prices', count(*)
-- FROM public.catalog_prices WHERE store = 'Supermercado Gama';
