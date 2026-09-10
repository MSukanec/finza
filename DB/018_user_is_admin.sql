-- 018_user_is_admin.sql
-- ============================================================
-- Marca de administrador por usuario. 2026-09-10.
--
-- Sirve para esconder secciones que todavía no están listas para un usuario
-- común (Presupuestos, Deudas, Importar). No es una barrera de seguridad de
-- datos: RLS sigue siendo lo que impide ver información ajena. Acá solo se
-- decide qué partes de la interfaz se ofrecen.
--
-- El usuario puede leer su propia fila (política "USERS SELECT OWN_USER_DATA"),
-- así que el cliente puede consultar su propio is_admin sin cambios de RLS.
--
-- IMPORTANTE: la política de UPDATE de `users` permite al usuario editar su
-- propia fila, así que sin esta protección cualquiera podría auto-ascenderse.
-- El trigger de abajo lo impide: solo el rol de servicio puede cambiarlo.
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Impide que un usuario se otorgue el flag a sí mismo vía la API.
--
-- NO es SECURITY DEFINER a propósito: dentro de una función SECURITY DEFINER,
-- `current_user` devuelve el dueño de la función y no quien la llama, así que
-- el chequeo pasaba siempre y el trigger no bloqueaba nada.
--
-- El corte es auth.uid(): si viene de una sesión de usuario por la API, tiene
-- valor y se rechaza. Desde el servidor (psql, service_role, migraciones) es
-- NULL y se permite.
CREATE OR REPLACE FUNCTION public.protect_is_admin()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'is_admin solo puede cambiarse desde el servidor';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_is_admin ON public.users;
CREATE TRIGGER guard_is_admin
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.protect_is_admin();

UPDATE public.users SET is_admin = true WHERE email = 'matusukanec@gmail.com';
