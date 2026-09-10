-- 031 · Los autores del historial no dependen de la membresía de hoy
--
-- El historial mostraba "Sistema" en cosas que había hecho una persona.
--
-- La app resolvía los nombres con `list_workspace_people`, que devuelve a los
-- miembros ACTUALES del espacio y se carga una sola vez, al iniciar sesión.
-- Eso falla en dos casos, y los dos son normales:
--
--   1. Alguien entra al espacio después de que vos abriste la app. Sus
--      acciones aparecen sin nombre hasta que recargás. Fue lo que pasó con
--      Joel: se registró, arqueó una billetera y cargó un gasto, y en el
--      historial figuraba como "Sistema".
--   2. Alguien deja de ser miembro. Ahí es peor: TODO su historial pasa a
--      "Sistema" de golpe. El historial es un registro de lo que pasó; que
--      alguien se vaya no cambia quién hizo qué.
--
-- Esta función devuelve a los autores que figuran en el historial del espacio,
-- hayan quedado como miembros o no. Sigue estando acotada por membresía: sólo
-- se responde a alguien que pertenece al espacio.

CREATE OR REPLACE FUNCTION public.activity_authors(ws uuid)
RETURNS TABLE (
    id         uuid,
    full_name  text,
    email      text,
    avatar_url text,
    /** Si hoy sigue perteneciendo al espacio. La app lo aclara al mostrarlo. */
    es_miembro boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_workspace_member(ws) THEN
        RAISE EXCEPTION 'No sos miembro de este espacio';
    END IF;

    RETURN QUERY
    SELECT u.id,
           u.full_name,
           u.email,
           u.avatar_url,
           EXISTS (
               SELECT 1 FROM public.workspace_members m
                WHERE m.workspace_id = ws AND m.user_id = u.id
           )
      FROM public.users u
     WHERE u.id IN (
        -- Quien figure en el historial...
        SELECT a.user_id FROM public.activity_log a
         WHERE a.workspace_id = ws AND a.user_id IS NOT NULL
        UNION
        -- ...y quien haya cargado un movimiento, para los avatares de la lista.
        SELECT t.user_id FROM public.transactions t
         WHERE t.workspace_id = ws AND t.user_id IS NOT NULL
        UNION
        -- ...más los miembros actuales, aunque todavía no hayan hecho nada.
        SELECT m.user_id FROM public.workspace_members m
         WHERE m.workspace_id = ws
     );
END;
$$;

REVOKE ALL ON FUNCTION public.activity_authors(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.activity_authors(uuid) TO authenticated;
