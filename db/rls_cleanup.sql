-- ============================================================================
-- MarktPlan — Limpieza de políticas RLS antiguas
--
-- ⚠️  ORDEN IMPORTANTE: ejecutar SOLO DESPUÉS de desplegar el PR #1.
--
--     Las políticas `public *` de store_prices son las que hoy mantienen viva
--     la Comparativa, porque el código en producción se identifica como
--     anónimo. Si se borran antes del despliegue, la Comparativa deja de
--     funcionar hasta que el código nuevo esté arriba.
--
-- Pegar y ejecutar en: Supabase → SQL Editor → New query → Run
-- Idempotente: se puede correr varias veces.
-- ============================================================================

-- ── 1. store_prices: cerrar el acceso anónimo ───────────────────────────────
--
-- Estas tres políticas usaban el rol `public` (que incluye a los anónimos)
-- con la condición `true`, sin restricción alguna. Como las políticas de
-- Postgres se combinan con OR, anulaban por completo las políticas
-- `store_prices_*` de rls_policies.sql: cualquiera con la anon key —que viaja
-- en el bundle público de la app— podía insertar, alterar o falsificar
-- precios sin tener cuenta.
--
-- Las políticas `store_prices_read/insert/update/delete` ya cubren el acceso
-- legítimo de los usuarios autenticados.

DROP POLICY IF EXISTS "public read"   ON public.store_prices;
DROP POLICY IF EXISTS "public insert" ON public.store_prices;
DROP POLICY IF EXISTS "public update" ON public.store_prices;


-- ── 2. Tablas privadas: quitar duplicados ───────────────────────────────────
--
-- `user owns data` NO era un agujero: exige auth.uid() = user_id, y para un
-- anónimo auth.uid() es NULL, así que nunca da verdadero. Es equivalente a las
-- políticas `*_owner` que ya instalamos.
--
-- Se eliminan por dos razones, ambas menores:
--   · Evitar dos políticas que dicen lo mismo (confunde al auditar).
--   · Rendimiento: `auth.uid()` suelto se reevalúa una vez por fila, mientras
--     que `(SELECT auth.uid())` se evalúa una sola vez por consulta.

DROP POLICY IF EXISTS "user owns data" ON public.shopping_items;
DROP POLICY IF EXISTS "user owns data" ON public.tracker_items;
DROP POLICY IF EXISTS "user owns data" ON public.saved_purchases;


-- ── 3. Verificación ─────────────────────────────────────────────────────────
-- Debe devolver 1 política por tabla privada y 4 en store_prices.
-- Ninguna fila debe mostrar {public} en la columna roles.

-- SELECT tablename AS tabla, policyname AS politica, roles, cmd AS operacion
-- FROM pg_policies
-- WHERE tablename IN ('shopping_items','tracker_items','saved_purchases','store_prices')
-- ORDER BY tablename, policyname;
