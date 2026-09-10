-- 023_arqueo_labels.sql
-- ============================================================
-- El historial mostraba "Creó wallet_reconciliations", con el nombre de la
-- tabla en crudo, porque entity_label() no conocía la tabla nueva.
--
-- De paso, un arqueo merece una frase propia: "Creó arqueo" no dice nada.
-- Tiene que decir qué billetera y si cuadró.
-- ============================================================

CREATE OR REPLACE FUNCTION public.entity_label(tabla text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE tabla
        WHEN 'transactions'           THEN 'movimiento'
        WHEN 'wallets'                THEN 'billetera'
        WHEN 'categories'             THEN 'categoría'
        WHEN 'category_groups'        THEN 'grupo de categorías'
        WHEN 'debts'                  THEN 'deuda'
        WHEN 'budgets'                THEN 'presupuesto'
        WHEN 'workspaces'             THEN 'espacio'
        WHEN 'workspace_members'      THEN 'miembro'
        WHEN 'wallet_reconciliations' THEN 'arqueo'
        ELSE tabla
    END
$$;

-- Frase propia para los arqueos: quién arqueó qué, y con qué resultado.
CREATE OR REPLACE FUNCTION public.reconciliation_summary(rec jsonb, op text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_wallet text;
    v_diff   numeric;
BEGIN
    SELECT name INTO v_wallet FROM public.wallets WHERE id = (rec->>'wallet_id')::uuid;
    v_diff := (rec->>'counted_amount')::numeric - (rec->>'expected_amount')::numeric;

    IF op = 'INSERT' THEN
        RETURN 'Arqueó ' || COALESCE(v_wallet, 'una billetera') || ': ' ||
            CASE
                WHEN abs(v_diff) < 0.01 THEN 'cuadra'
                WHEN v_diff < 0 THEN 'faltan ' || to_char(abs(v_diff), 'FM999,999,999,990.00')
                ELSE 'sobran ' || to_char(v_diff, 'FM999,999,999,990.00')
            END;
    END IF;

    IF rec->>'status' = 'resolved' THEN
        RETURN 'Cerró la diferencia del arqueo de ' || COALESCE(v_wallet, 'una billetera') ||
            CASE rec->>'resolution'
                WHEN 'adjusted'  THEN ' asentando un ajuste'
                WHEN 'explained' THEN ' dándola por explicada'
                ELSE ''
            END;
    END IF;

    RETURN 'Editó el arqueo de ' || COALESCE(v_wallet, 'una billetera');
END;
$$;

-- El trigger genérico delega en la frase específica cuando la tabla la tiene.
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
        (workspace_id, user_id, action, entity, entity_id, summary, changes)
    VALUES (v_ws, v_actor, v_action, TG_TABLE_NAME, (v_rec->>'id')::uuid, v_summary, v_changes);

    RETURN COALESCE(NEW, OLD);
END;
$$;
