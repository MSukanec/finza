-- 034 · Las fotos de perfil de Google no se estaban guardando
--
-- `handle_new_user` copiaba `email` y `full_name` del alta, pero no la foto.
-- Google la manda en `raw_user_meta_data`, así que estaba disponible y se
-- descartaba: los usuarios que entraron con Google quedaron con `avatar_url`
-- en NULL y en la app se veían con iniciales.
--
-- Además se sincroniza en cada ingreso. Supabase reescribe
-- `raw_user_meta_data` cada vez que alguien entra por OAuth, así que si la
-- persona cambia su foto de Google, acá se actualiza sola. Sin esto la foto
-- quedaría congelada en la del día que se registró.
--
-- Quien se registra con mail y contraseña no tiene foto y sigue viéndose con
-- sus iniciales, que es lo correcto: no hay nada que mostrar.

-- Google manda `avatar_url`; otros proveedores usan `picture`.
CREATE OR REPLACE FUNCTION public.avatar_de_metadata(meta jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT NULLIF(COALESCE(meta->>'avatar_url', meta->>'picture'), '')
$$;

-- ---------------------------------------------------------------- 1. Alta

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_user uuid;
BEGIN
    INSERT INTO public.users (auth_id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        public.avatar_de_metadata(NEW.raw_user_meta_data)
    )
    RETURNING id INTO v_user;

    -- Invitaciones pendientes dirigidas a este email
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    SELECT i.workspace_id, v_user, i.role
      FROM public.workspace_invitations i
     WHERE lower(i.email) = lower(NEW.email) AND i.accepted_at IS NULL
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

    UPDATE public.workspace_invitations
       SET accepted_at = now()
     WHERE lower(email) = lower(NEW.email) AND accepted_at IS NULL;

    RETURN NEW;
END;
$function$;

-- ------------------------------------------------- 2. Cada ingreso posterior

CREATE OR REPLACE FUNCTION public.sync_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    UPDATE public.users u
       SET avatar_url = COALESCE(public.avatar_de_metadata(NEW.raw_user_meta_data), u.avatar_url),
           full_name  = COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), u.full_name),
           email      = COALESCE(NEW.email, u.email)
     WHERE u.auth_id = NEW.id;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_profile_on_login ON auth.users;
CREATE TRIGGER sync_profile_on_login
    AFTER UPDATE ON auth.users
    FOR EACH ROW
    -- Sólo cuando cambia algo del perfil, no en cada refresh de token.
    WHEN (
        OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data
        OR OLD.email IS DISTINCT FROM NEW.email
    )
    EXECUTE FUNCTION public.sync_user_profile();

-- ---------------------------------------------------------------- 3. Los que ya estaban

UPDATE public.users u
   SET avatar_url = public.avatar_de_metadata(au.raw_user_meta_data)
  FROM auth.users au
 WHERE au.id = u.auth_id
   AND u.avatar_url IS NULL
   AND public.avatar_de_metadata(au.raw_user_meta_data) IS NOT NULL;
