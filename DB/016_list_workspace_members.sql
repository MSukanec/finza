-- 016_list_workspace_members.sql
-- ============================================================
-- Listar los miembros de un espacio. 2026-09-10.
--
-- Por que un RPC y no un join desde el cliente:
-- la politica de SELECT de `users` es `auth_id = auth.uid()`, o sea que cada
-- uno solo se ve a si mismo. Un join contra workspace_members devolveria ids
-- sin email ni nombre.
--
-- La alternativa era ampliar la politica de `users` para que los co-miembros
-- se vean entre si. Se prefirio este RPC: expone exactamente los datos que la
-- pantalla necesita (email, nombre, rol) y solo a quien ya es miembro del
-- espacio, sin abrir la tabla `users` de forma general.
--
-- Devuelve tambien las invitaciones pendientes, marcadas con pending = true.
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_workspace_members(ws uuid)
RETURNS TABLE (
    id        uuid,
    user_id   uuid,
    email     text,
    full_name text,
    role      text,
    pending   boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_workspace_member(ws) THEN
        RAISE EXCEPTION 'No sos miembro de este espacio';
    END IF;

    RETURN QUERY
        SELECT m.id, m.user_id, u.email, u.full_name, m.role, false
          FROM public.workspace_members m
          JOIN public.users u ON u.id = m.user_id
         WHERE m.workspace_id = ws

        UNION ALL

        SELECT i.id, NULL::uuid, i.email, NULL::text, i.role, true
          FROM public.workspace_invitations i
         WHERE i.workspace_id = ws AND i.accepted_at IS NULL

        ORDER BY 6, 5 DESC, 3;
END;
$$;

REVOKE ALL ON FUNCTION public.list_workspace_members(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_workspace_members(uuid) TO authenticated;

-- Solo usuarios con sesion pueden invitar
REVOKE ALL ON FUNCTION public.invite_to_workspace(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.invite_to_workspace(uuid, text, text) TO authenticated;
