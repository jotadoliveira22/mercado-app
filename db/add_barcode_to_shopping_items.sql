-- ============================================================================
-- MarktPlan — Guardar el código de barras en la lista de compras
--
-- Pegar y ejecutar en: Supabase → SQL Editor → New query → Run
-- Aditivo e idempotente: no toca datos existentes ni rompe la app actual.
--
-- Por qué: los precios de `store_prices` se identifican por código de barras.
-- Hasta ahora la Lista escaneaba el código, lo usaba para buscar el nombre y lo
-- descartaba, así que los precios solo podían cruzarse por nombre exacto.
-- Guardándolo, el cruce pasa a ser exacto de aquí en adelante.
-- ============================================================================

ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS barcode text;

-- Acelera el cruce de la lista contra los precios registrados.
CREATE INDEX IF NOT EXISTS shopping_items_barcode_idx
  ON public.shopping_items (barcode)
  WHERE barcode IS NOT NULL;


-- ── Verificación ────────────────────────────────────────────────────────────
-- Debe devolver una fila: barcode | text | YES

-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'shopping_items'
--   AND column_name = 'barcode';
