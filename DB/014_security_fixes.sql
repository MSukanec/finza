-- 014_security_fixes.sql
-- ============================================================
-- Correcciones de seguridad y del bug de borrado. 2026-09-10.
-- Idempotente: se puede correr mas de una vez.
--
-- 1. BUG: borrar un movimiento nunca funciono (0 de 1504 filas tenian
--    deleted_at). `removeTransaction` hace soft delete via UPDATE, y la base
--    lo rechazaba con 42501.
--
--    Causa real (verificada aislando statement por statement): la politica de
--    SELECT incluia `deleted_at IS NULL`. Postgres exige que la fila que queda
--    despues de un UPDATE siga siendo visible bajo las politicas de SELECT del
--    que ejecuta; al setear deleted_at la fila dejaba de ser visible para si
--    mismo y el UPDATE se rechazaba. Comprobado: sacando esa condicion de la
--    politica de SELECT, el mismo UPDATE pasa.
--
--    Criterio de la correccion: RLS define QUIEN ve una fila, no EN QUE ESTADO.
--    El filtrado de borrados es responsabilidad de las queries, que ya lo hacen
--    (`.is('deleted_at', null)`).
--
-- 2. handle_new_user() es SECURITY DEFINER sin search_path fijo.
--    Se fija a public, pg_temp (recomendacion de Supabase).
--
-- 3. category_groups: el rol anon podia leer los grupos de sistema sin sesion.
--    No es data personal, pero no hay razon para exponerlos.
-- ============================================================

-- 1 ---------------------------------------------------------
DROP POLICY IF EXISTS "USERS SELECT OWN_TRANSACTIONS" ON public.transactions;
CREATE POLICY "USERS SELECT OWN_TRANSACTIONS" ON public.transactions
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "USERS UPDATE OWN_TRANSACTIONS" ON public.transactions;
CREATE POLICY "USERS UPDATE OWN_TRANSACTIONS" ON public.transactions
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid())
  )
  WITH CHECK (
    user_id = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid())
  );

-- 2 ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    INSERT INTO public.users (auth_id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$function$;

-- 3 ---------------------------------------------------------
DROP POLICY IF EXISTS "Users view own and system groups" ON public.category_groups;
CREATE POLICY "Users view own and system groups" ON public.category_groups
  FOR SELECT TO authenticated
  USING (
    user_id IS NULL
    OR user_id = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid())
  );
