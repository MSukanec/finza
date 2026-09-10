-- 020_activity_log.sql
-- ============================================================
-- Registro de actividad: quién hizo qué y cuándo. 2026-09-10.
--
-- Se implementa con TRIGGERS EN LA BASE, no en el cliente, a propósito:
-- registrar desde la app deja afuera todo lo que no pasa por ella (scripts,
-- SQL directo, futuras API routes) y obliga a acordarse de instrumentar cada
-- función nueva. Con triggers, si la fila cambia, queda registrado. Punto.
--
-- Autor: se toma de auth.uid() vía current_user_id(). Si es NULL, el cambio
-- vino del servidor (una migración, un script) y se muestra como "Sistema".
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Avatar y nombre del usuario, para poder mostrar quién fue
-- ------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;

UPDATE public.users u
   SET avatar_url = a.raw_user_meta_data->>'avatar_url',
       full_name  = COALESCE(u.full_name, a.raw_user_meta_data->>'full_name')
  FROM auth.users a
 WHERE a.id = u.auth_id
   AND u.avatar_url IS DISTINCT FROM (a.raw_user_meta_data->>'avatar_url');

-- ------------------------------------------------------------
-- 2. La tabla
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
    -- Sin FK a users: si se borra un usuario, su historial debe sobrevivir.
    user_id      uuid,
    action       text NOT NULL CHECK (action IN ('insert','update','delete')),
    entity       text NOT NULL,
    entity_id    uuid,
    summary      text NOT NULL,
    changes      jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_ws_idx ON public.activity_log(workspace_id, created_at DESC);

-- ------------------------------------------------------------
-- 3. Etiquetas legibles
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_label(tabla text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE tabla
        WHEN 'transactions'      THEN 'movimiento'
        WHEN 'wallets'           THEN 'billetera'
        WHEN 'categories'        THEN 'categoría'
        WHEN 'category_groups'   THEN 'grupo de categorías'
        WHEN 'debts'             THEN 'deuda'
        WHEN 'budgets'           THEN 'presupuesto'
        WHEN 'workspaces'        THEN 'espacio'
        WHEN 'workspace_members' THEN 'miembro'
        ELSE tabla
    END
$$;

-- ------------------------------------------------------------
-- 4. El trigger genérico
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec     jsonb;
    v_old     jsonb;
    v_ws      uuid;
    v_actor   uuid;
    v_summary text;
    v_changes jsonb;
    v_nombre  text;
    k         text;
BEGIN
    v_rec := to_jsonb(COALESCE(NEW, OLD));
    v_old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;

    -- El espacio: casi todas las tablas lo traen; `workspaces` es su propio id.
    v_ws := COALESCE(
        (v_rec->>'workspace_id')::uuid,
        CASE WHEN TG_TABLE_NAME = 'workspaces' THEN (v_rec->>'id')::uuid END
    );

    v_actor := public.current_user_id();

    -- Un nombre para que la línea se lea sola.
    v_nombre := COALESCE(
        NULLIF(v_rec->>'description', ''),
        NULLIF(v_rec->>'name', ''),
        NULLIF(v_rec->>'email', '')
    );

    v_summary := CASE TG_OP
        WHEN 'INSERT' THEN 'Creó'
        WHEN 'UPDATE' THEN 'Editó'
        ELSE 'Eliminó'
    END || ' ' || public.entity_label(TG_TABLE_NAME)
      || COALESCE(' «' || left(v_nombre, 80) || '»', '');

    -- En un update, qué campos cambiaron de verdad.
    IF TG_OP = 'UPDATE' THEN
        v_changes := '{}'::jsonb;
        FOR k IN SELECT jsonb_object_keys(v_rec) LOOP
            IF k NOT IN ('updated_at', 'created_at')
               AND v_rec->k IS DISTINCT FROM v_old->k THEN
                v_changes := v_changes || jsonb_build_object(
                    k, jsonb_build_object('antes', v_old->k, 'despues', v_rec->k)
                );
            END IF;
        END LOOP;

        -- Un update que no cambió nada no es actividad.
        IF v_changes = '{}'::jsonb THEN
            RETURN COALESCE(NEW, OLD);
        END IF;
    END IF;

    INSERT INTO public.activity_log
        (workspace_id, user_id, action, entity, entity_id, summary, changes)
    VALUES (v_ws, v_actor, lower(TG_OP), TG_TABLE_NAME, (v_rec->>'id')::uuid, v_summary, v_changes);

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- ------------------------------------------------------------
-- 5. Enganchar todo lo que le importa al usuario
-- ------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'transactions', 'wallets', 'categories', 'category_groups',
        'debts', 'budgets', 'workspaces', 'workspace_members'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS log_activity_%1$s ON public.%1$I', t);
        EXECUTE format(
            'CREATE TRIGGER log_activity_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
             FOR EACH ROW EXECUTE FUNCTION public.log_activity()', t
        );
    END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6. RLS: se ve el historial del espacio donde sos miembro.
--    Nadie edita ni borra: un registro que se puede alterar no sirve de nada.
-- ------------------------------------------------------------
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_log_select ON public.activity_log;
CREATE POLICY activity_log_select ON public.activity_log
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

GRANT SELECT ON public.activity_log TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.activity_log FROM authenticated, anon;

-- ------------------------------------------------------------
-- 7. Autores: nombre y avatar de quien hizo cada cosa.
--    La política de `users` deja ver sólo la fila propia, así que sin esto el
--    historial mostraría ids sueltos. Devuelve únicamente a los miembros del
--    espacio, no abre la tabla `users`.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_workspace_people(ws uuid)
RETURNS TABLE (id uuid, full_name text, email text, avatar_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_workspace_member(ws) THEN
        RAISE EXCEPTION 'No sos miembro de este espacio';
    END IF;

    RETURN QUERY
        SELECT u.id, u.full_name, u.email, u.avatar_url
          FROM public.users u
          JOIN public.workspace_members m ON m.user_id = u.id
         WHERE m.workspace_id = ws;
END;
$$;

REVOKE ALL ON FUNCTION public.list_workspace_people(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_workspace_people(uuid) TO authenticated;
