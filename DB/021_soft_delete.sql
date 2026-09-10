-- 021_soft_delete.sql
-- ============================================================
-- Borrado lógico en toda la app. 2026-09-10.
--
-- Hasta ahora sólo `transactions` tenía `deleted_at`. Todo lo demás se borraba
-- de verdad, y encima con ON DELETE CASCADE: eliminar un espacio se llevaba
-- puestos billeteras, movimientos y categorías sin vuelta atrás.
--
-- IMPORTANTE — el filtro va en las QUERIES, no en las políticas RLS.
-- Ya se cometió ese error una vez (ver DB/014): con `deleted_at IS NULL` dentro
-- de la política de SELECT, el propio UPDATE que marca la fila como borrada la
-- vuelve invisible para quien la está editando y Postgres lo rechaza con 42501.
-- RLS define QUIÉN ve una fila, no EN QUÉ ESTADO.
--
-- EXCEPCIÓN DELIBERADA: `workspace_members` sigue con borrado real.
-- Quitarle el acceso a alguien tiene que quitárselo de verdad; una membresía
-- marcada como borrada seguiría haciendo que `is_workspace_member()` devuelva
-- true y sería un agujero de seguridad. Queda registrada en activity_log igual.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. La columna donde falta
-- ------------------------------------------------------------
ALTER TABLE public.wallets         ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.categories      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.category_groups ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.debts           ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.budgets         ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.workspaces      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Índices parciales: casi todas las consultas piden sólo lo vivo.
CREATE INDEX IF NOT EXISTS wallets_alive_idx    ON public.wallets(workspace_id)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS categories_alive_idx ON public.categories(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS budgets_alive_idx    ON public.budgets(workspace_id)    WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- 2. Un espacio borrado deja de contar como espacio.
--    Sin esto, is_workspace_member() seguiría dando true sobre un espacio que
--    el usuario ya "eliminó" y volvería a aparecer en su lista.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.workspace_members m
          JOIN public.workspaces w ON w.id = m.workspace_id
         WHERE m.workspace_id = ws
           AND m.user_id = public.current_user_id()
           AND w.deleted_at IS NULL
    )
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(ws uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.workspace_members m
          JOIN public.workspaces w ON w.id = m.workspace_id
         WHERE m.workspace_id = ws
           AND m.user_id = public.current_user_id()
           AND m.role = 'owner'
           AND w.deleted_at IS NULL
    )
$$;

-- ------------------------------------------------------------
-- 3. El historial tiene que decir "eliminó", no "editó".
--    Un borrado lógico es un UPDATE a nivel base, así que sin esto el registro
--    diría que alguien editó algo cuando en realidad lo eliminó.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec     jsonb;
    v_old     jsonb;
    v_ws      uuid;
    v_actor   uuid;
    v_action  text;
    v_verbo   text;
    v_summary text;
    v_changes jsonb;
    v_nombre  text;
    k         text;
BEGIN
    v_rec := to_jsonb(COALESCE(NEW, OLD));
    v_old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;

    v_ws := COALESCE(
        (v_rec->>'workspace_id')::uuid,
        CASE WHEN TG_TABLE_NAME = 'workspaces' THEN (v_rec->>'id')::uuid END
    );

    v_actor := public.current_user_id();

    -- Un UPDATE que enciende deleted_at es, para el usuario, un borrado.
    -- Y si lo apaga, es una restauración.
    v_action := lower(TG_OP);
    IF TG_OP = 'UPDATE' THEN
        IF v_old->>'deleted_at' IS NULL AND v_rec->>'deleted_at' IS NOT NULL THEN
            v_action := 'delete';
        ELSIF v_old->>'deleted_at' IS NOT NULL AND v_rec->>'deleted_at' IS NULL THEN
            v_action := 'insert'; -- se muestra como "Restauró"
        END IF;
    END IF;

    v_nombre := COALESCE(
        NULLIF(v_rec->>'description', ''),
        NULLIF(v_rec->>'name', ''),
        NULLIF(v_rec->>'email', '')
    );

    v_verbo := CASE
        WHEN v_action = 'delete' THEN 'Eliminó'
        WHEN TG_OP = 'INSERT' THEN 'Creó'
        WHEN v_action = 'insert' THEN 'Restauró'
        ELSE 'Editó'
    END;

    v_summary := v_verbo || ' ' || public.entity_label(TG_TABLE_NAME)
        || COALESCE(' «' || left(v_nombre, 80) || '»', '');

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

        IF v_changes = '{}'::jsonb THEN
            RETURN COALESCE(NEW, OLD);
        END IF;

        -- En un borrado o una restauración, el cambio de deleted_at ya está
        -- dicho por el verbo; listarlo como campo es ruido.
        IF v_action IN ('delete', 'insert') THEN
            v_changes := v_changes - 'deleted_at';
            IF v_changes = '{}'::jsonb THEN v_changes := NULL; END IF;
        END IF;
    END IF;

    INSERT INTO public.activity_log
        (workspace_id, user_id, action, entity, entity_id, summary, changes)
    VALUES (v_ws, v_actor, v_action, TG_TABLE_NAME, (v_rec->>'id')::uuid, v_summary, v_changes);

    RETURN COALESCE(NEW, OLD);
END;
$$;
