-- 050 · Los socios editan lo de todos, y queda escrito quién tocó qué
--
-- Cambio de regla pedido por el usuario el 2026-10-06, que da vuelta DB/045.
--
-- DB/045 ató CAMBIAR un movimiento a quien lo cargó, para todos los roles. En
-- un restaurante con socios eso no funciona: si Ariel carga un gasto con la
-- categoría equivocada, cualquiera de los socios tiene que poder corregirlo sin
-- pedirle a él que entre. La respuesta no es prohibirlo, es que quede registrado.
--
-- Regla nueva:
--
--   VER      →  el administrador y los miembros ven todo el espacio; el
--               colaborador, sólo lo que cargó él (sin cambios, DB/034).
--   CAMBIAR  →  lo mismo que ver. Si lo ves, lo podés corregir.
--   QUIÉN    →  cada cambio queda en Actividad con quién lo hizo y DE QUIÉN era
--               lo que tocó.
--
-- El colaborador sigue encerrado en lo suyo: eso no cambia, porque tampoco ve
-- el resto.

-- ---------------------------------------------------------------- movimientos

DROP POLICY IF EXISTS transactions_update ON public.transactions;
CREATE POLICY transactions_update ON public.transactions
    FOR UPDATE TO authenticated
    USING      (public.is_workspace_member(workspace_id)
                AND (public.can_see_all(workspace_id) OR user_id = public.current_user_id()))
    WITH CHECK (public.is_workspace_member(workspace_id)
                AND (public.can_see_all(workspace_id) OR user_id = public.current_user_id()));

DROP POLICY IF EXISTS transactions_delete ON public.transactions;
CREATE POLICY transactions_delete ON public.transactions
    FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id)
           AND (public.can_see_all(workspace_id) OR user_id = public.current_user_id()));

-- ---------------------------------------------------------------- comprobantes
--
-- Vuelven a ir de la mano del movimiento, como en DB/044: quien ve el
-- movimiento puede adjuntarle y quitarle comprobantes. El `EXISTS` sobre
-- `transactions` ya pasa por la RLS de quien consulta, así que no hace falta
-- repetir acá la regla de roles — y no hay que repetirla: si se separan, un día
-- dicen cosas distintas.

DROP POLICY IF EXISTS adjuntos_insert ON public.transaction_attachments;
CREATE POLICY adjuntos_insert ON public.transaction_attachments
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id)
        AND user_id = public.current_user_id()
        AND storage_path LIKE workspace_id::text || '/' || transaction_id::text || '/%'
    );

DROP POLICY IF EXISTS adjuntos_update ON public.transaction_attachments;
CREATE POLICY adjuntos_update ON public.transaction_attachments
    FOR UPDATE TO authenticated
    USING      (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id))
    WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id));

DROP POLICY IF EXISTS adjuntos_subir ON storage.objects;
CREATE POLICY adjuntos_subir ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'adjuntos'
        AND EXISTS (
            SELECT 1 FROM public.transactions t
             WHERE t.id = public.movimiento_del_archivo(name)
               AND t.workspace_id = public.espacio_del_archivo(name)
        )
    );

-- ---------------------------------------------------------------- de quién era
--
-- Si cualquiera puede corregir lo de cualquiera, el historial tiene que decir
-- las dos cosas: quién lo hizo y de quién era. "Editó un movimiento" no alcanza
-- cuando el movimiento lo había cargado otro.

ALTER TABLE public.activity_log
    ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES public.users(id);

COMMENT ON COLUMN public.activity_log.target_user_id IS
    'De quién era la fila que se tocó. NULL si es de quien hizo el cambio o si la fila no tiene dueño.';

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_rec     jsonb;
    v_old     jsonb;
    v_ws      uuid;
    v_actor   uuid;
    v_duenio  uuid;
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

    -- Sumarse a un espacio lo hace el propio miembro, y el alta corre sin
    -- sesion (auth.uid() todavia es NULL): sin esto la entrada quedaba sin
    -- autor y, desde que el historial muestra solo acciones de personas, no
    -- aparecia en ninguna parte.
    IF v_actor IS NULL AND TG_TABLE_NAME = 'workspace_members' THEN
        v_actor := (v_rec->>'user_id')::uuid;
    END IF;

    -- De quién era lo que se tocó, cuando no es de quien lo tocó (DB/050).
    v_duenio := NULLIF((v_rec->>'user_id')::uuid, v_actor);

    v_action := lower(TG_OP);
    IF TG_OP = 'UPDATE' THEN
        IF v_old->>'deleted_at' IS NULL AND v_rec->>'deleted_at' IS NOT NULL THEN
            v_action := 'delete';
        ELSIF v_old->>'deleted_at' IS NOT NULL AND v_rec->>'deleted_at' IS NULL THEN
            v_action := 'insert';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'wallet_reconciliations' THEN
        v_summary := public.reconciliation_summary(v_rec, TG_OP);
    ELSE
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
    END IF;

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

        IF v_action IN ('delete', 'insert') THEN
            v_changes := v_changes - 'deleted_at';
            IF v_changes = '{}'::jsonb THEN v_changes := NULL; END IF;
        END IF;
    END IF;

    INSERT INTO public.activity_log
        (workspace_id, user_id, action, entity, entity_id, summary, changes, target_user_id)
    VALUES (v_ws, v_actor, v_action, TG_TABLE_NAME, (v_rec->>'id')::uuid, v_summary, v_changes, v_duenio);

    RETURN COALESCE(NEW, OLD);
END;
$function$;
