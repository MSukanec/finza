-- 042 · Última conexión de cada miembro
--
-- Entre socios, saber si alguien entró esta semana o hace dos meses es
-- información de trabajo: dice quién está mirando las cuentas y quién no. Se
-- suma a la lista de miembros que ya existía.
--
-- El dato sale de `auth.users.last_sign_in_at`, que la app no puede leer
-- directamente —el esquema auth no está expuesto—. Por eso viaja por esta
-- función, que ya corta por `can_see_all`: un colaborador no ve ni la lista.

-- Cambia la forma de lo que devuelve, así que hay que darla de baja primero:
-- CREATE OR REPLACE no puede alterar el tipo de retorno.
DROP FUNCTION IF EXISTS public.list_workspace_members(uuid);

CREATE FUNCTION public.list_workspace_members(ws uuid)
RETURNS TABLE (
    id           uuid,
    user_id      uuid,
    email        text,
    full_name    text,
    role         text,
    pending      boolean,
    /** Último ingreso. NULL si se registró y nunca entró, o si no aceptó aún. */
    last_sign_in timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF NOT public.can_see_all(ws) THEN
        RAISE EXCEPTION 'No tenés acceso a esta información en este espacio';
    END IF;

    RETURN QUERY
        SELECT m.id, m.user_id, u.email, u.full_name, m.role, false, au.last_sign_in_at
          FROM public.workspace_members m
          JOIN public.users u ON u.id = m.user_id
          LEFT JOIN auth.users au ON au.id = u.auth_id
         WHERE m.workspace_id = ws

        UNION ALL

        -- Una invitación sin aceptar no tiene cuenta todavía: no hay conexión
        -- que mostrar y la pantalla lo dice como "sin aceptar".
        SELECT i.id, NULL::uuid, i.email, NULL::text, i.role, true, NULL::timestamptz
          FROM public.workspace_invitations i
         WHERE i.workspace_id = ws AND i.accepted_at IS NULL

        ORDER BY 6, 5 DESC, 3;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_workspace_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_workspace_members(uuid) TO authenticated;
