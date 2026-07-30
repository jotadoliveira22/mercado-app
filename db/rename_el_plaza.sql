-- ============================================================================
-- MarktPlan — Renombrar "Supermercado El Plaza" → "Automercados Plaza"
--
-- Pegar y ejecutar en: Supabase → SQL Editor → New query → Run
-- Idempotente: correrlo dos veces no cambia nada la segunda vez.
--
-- Por qué hace falta: el nombre del establecimiento se guarda como TEXTO en
-- store_prices.store y saved_purchases.store. Al renombrarlo en la app, las
-- filas existentes seguirían con el nombre viejo y quedarían huérfanas: sus
-- precios no aparecerían en la Comparativa y las compras guardadas mostrarían
-- un establecimiento que ya no existe en el selector.
-- ============================================================================

-- Cuántas filas se van a tocar. Correr ANTES para saber qué esperar.
-- SELECT 'store_prices' AS tabla, count(*) FROM public.store_prices
--   WHERE store = 'Supermercado El Plaza'
-- UNION ALL
-- SELECT 'saved_purchases', count(*) FROM public.saved_purchases
--   WHERE store = 'Supermercado El Plaza';


-- ── 1. Compras guardadas ────────────────────────────────────────────────────
-- Sin conflictos posibles: es solo una etiqueta descriptiva.

UPDATE public.saved_purchases
SET store = 'Automercados Plaza'
WHERE store = 'Supermercado El Plaza';


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
WHERE viejo.store = 'Supermercado El Plaza'
  AND EXISTS (
    SELECT 1 FROM public.store_prices nuevo
    WHERE nuevo.store = 'Automercados Plaza'
      AND nuevo.barcode = viejo.barcode
  );

UPDATE public.store_prices
SET store = 'Automercados Plaza'
WHERE store = 'Supermercado El Plaza';


-- ── 3. Verificación ─────────────────────────────────────────────────────────
-- Debe devolver 0 en ambas filas.

-- SELECT 'store_prices' AS tabla, count(*) AS quedan_con_nombre_viejo
-- FROM public.store_prices WHERE store = 'Supermercado El Plaza'
-- UNION ALL
-- SELECT 'saved_purchases', count(*)
-- FROM public.saved_purchases WHERE store = 'Supermercado El Plaza';
