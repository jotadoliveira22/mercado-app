-- ============================================================================
-- MarktPlan — Políticas RLS (Row Level Security)
--
-- Pegar y ejecutar en: Supabase → SQL Editor → New query → Run
--
-- Es idempotente: se puede correr varias veces sin romper nada.
--
-- Modelo de seguridad:
--   · shopping_items, tracker_items, saved_purchases → privadas por usuario.
--     Cada quien solo ve y modifica sus propias filas.
--   · store_prices → compartida (es la comparativa colaborativa de precios).
--     Cualquier usuario autenticado lee y aporta precios; los anónimos no
--     pueden escribir. Se guarda quién aportó cada precio para poder auditar.
-- ============================================================================

-- ── 1. Activar RLS en las cuatro tablas ─────────────────────────────────────
-- Sin esto, la anon key da acceso total a la tabla desde cualquier navegador.

ALTER TABLE public.shopping_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_purchases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_prices     ENABLE ROW LEVEL SECURITY;


-- ── 2. Tablas privadas por usuario ──────────────────────────────────────────
-- Una sola política FOR ALL cubre SELECT/INSERT/UPDATE/DELETE.
--   USING       → qué filas puede ver/afectar
--   WITH CHECK  → qué filas puede crear/dejar (impide escribir con otro user_id)

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shopping_items', 'tracker_items', 'saved_purchases']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL
        TO authenticated
        USING (user_id = (SELECT auth.uid()))
        WITH CHECK (user_id = (SELECT auth.uid()))
    $f$, t || '_owner', t);
  END LOOP;
END $$;


-- ── 3. store_prices: comparativa compartida ─────────────────────────────────

-- Columna de atribución: permite saber quién aportó cada precio y revertir
-- datos erróneos. Se rellena sola con el usuario que inserta.
ALTER TABLE public.store_prices
  ADD COLUMN IF NOT EXISTS contributed_by uuid
  REFERENCES auth.users(id) ON DELETE SET NULL
  DEFAULT auth.uid();

-- Marca de tiempo del último cambio (la app ya lee recorded_at).
ALTER TABLE public.store_prices
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT now();

-- El upsert de la app usa onConflict: 'barcode,store'. Sin esta restricción
-- única, el upsert falla y se insertarían filas duplicadas por tienda.
CREATE UNIQUE INDEX IF NOT EXISTS store_prices_barcode_store_key
  ON public.store_prices (barcode, store);

-- Índice para la consulta principal: precios de un producto, del más barato
-- al más caro.
CREATE INDEX IF NOT EXISTS store_prices_barcode_price_idx
  ON public.store_prices (barcode, price_usd ASC);

-- Lectura: cualquier usuario autenticado (la comparativa es colaborativa).
DROP POLICY IF EXISTS store_prices_read ON public.store_prices;
CREATE POLICY store_prices_read ON public.store_prices
  FOR SELECT TO authenticated
  USING (true);

-- Alta de precios: solo autenticados, y no se puede firmar como otra persona.
DROP POLICY IF EXISTS store_prices_insert ON public.store_prices;
CREATE POLICY store_prices_insert ON public.store_prices
  FOR INSERT TO authenticated
  WITH CHECK (contributed_by IS NULL OR contributed_by = (SELECT auth.uid()));

-- Actualización: cualquier autenticado puede refrescar un precio (los precios
-- cambian y quien esté en la tienda hoy tiene el dato más fresco), pero queda
-- registrado quién lo hizo.
DROP POLICY IF EXISTS store_prices_update ON public.store_prices;
CREATE POLICY store_prices_update ON public.store_prices
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (contributed_by IS NULL OR contributed_by = (SELECT auth.uid()));

-- Borrado: solo quien aportó el precio puede eliminarlo.
DROP POLICY IF EXISTS store_prices_delete ON public.store_prices;
CREATE POLICY store_prices_delete ON public.store_prices
  FOR DELETE TO authenticated
  USING (contributed_by = (SELECT auth.uid()));

-- Mantiene recorded_at y contributed_by al día en cada UPDATE del upsert.
CREATE OR REPLACE FUNCTION public.touch_store_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.recorded_at   := now();
  NEW.contributed_by := auth.uid();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS store_prices_touch ON public.store_prices;
CREATE TRIGGER store_prices_touch
  BEFORE UPDATE ON public.store_prices
  FOR EACH ROW EXECUTE FUNCTION public.touch_store_price();


-- ── 4. Índices para las tablas por usuario ──────────────────────────────────
-- Toda consulta de la app filtra por user_id.

CREATE INDEX IF NOT EXISTS shopping_items_user_idx  ON public.shopping_items (user_id);
CREATE INDEX IF NOT EXISTS tracker_items_user_idx   ON public.tracker_items (user_id);
CREATE INDEX IF NOT EXISTS saved_purchases_user_idx ON public.saved_purchases (user_id, date DESC);


-- ── 5. Verificación ─────────────────────────────────────────────────────────
-- Corre esto después para confirmar que quedó todo bien.
-- rls_activo debe ser true en las cuatro filas.

-- SELECT c.relname AS tabla,
--        c.relrowsecurity AS rls_activo,
--        count(p.polname) AS politicas
-- FROM pg_class c
-- LEFT JOIN pg_policy p ON p.polrelid = c.oid
-- WHERE c.relname IN ('shopping_items','tracker_items','saved_purchases','store_prices')
-- GROUP BY c.relname, c.relrowsecurity
-- ORDER BY c.relname;
