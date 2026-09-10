-- 033 · Vaciados reversibles desde la app
--
-- Vaciar un espacio para empezar la caja de cero es una operación legítima, pero
-- hasta ahora sólo se podía hacer con un script y sólo se podía deshacer con
-- otro. Eso deja al usuario dependiendo de que alguien con acceso a la base esté
-- disponible, que para su propia plata es una mala posición.
--
-- Un vaciado pasa a ser UNA fila en `purges`: quién, cuándo, por qué, cuántos
-- movimientos y qué saldos iniciales había. Los movimientos quedan dados de baja
-- apuntando a esa fila, así restaurar es una sola operación y no una arqueología.

-- ---------------------------------------------------------------- 1. Tabla

CREATE TABLE IF NOT EXISTS public.purges (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES public.users(id),

    /* Para qué se vació. Dentro de seis meses nadie se acuerda. */
    reason       text,

    transactions_count integer NOT NULL DEFAULT 0,

    /*
     * Los saldos iniciales de las billeteras antes del vaciado, para poder
     * devolverlos. Van acá y no en las billeteras porque `initial_balance` es
     * una columna sola: sin esta foto, el número anterior se pierde.
     */
    balances     jsonb NOT NULL DEFAULT '[]'::jsonb,

    created_at   timestamptz NOT NULL DEFAULT now(),
    restored_at  timestamptz
);

CREATE INDEX IF NOT EXISTS purges_espacio_idx
    ON public.purges (workspace_id, created_at DESC);

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS purge_id uuid REFERENCES public.purges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_purga_idx
    ON public.transactions (purge_id) WHERE purge_id IS NOT NULL;

-- ---------------------------------------------------------------- 2. Silencio

/*
 * Un vaciado de 1500 movimientos dejaría 1500 entradas en el historial y lo
 * volvería inservible justo el día que más se lo necesita. El vaciado se anota
 * como UN hecho, en `purges`.
 *
 * El silencio va como cláusula WHEN del trigger y no como un `IF` adentro de
 * `log_activity`: así no hay que tocar una función que usan diez tablas, y el
 * costo por fila es evaluar un `current_setting`. El flag es local a la
 * transacción, así que no puede quedarse encendido por accidente.
 */
DROP TRIGGER IF EXISTS log_activity_transactions ON public.transactions;
CREATE TRIGGER log_activity_transactions
    AFTER INSERT OR UPDATE OR DELETE ON public.transactions
    FOR EACH ROW
    WHEN (coalesce(current_setting('app.silenciar_historial', true), '') <> 'on')
    EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS log_activity_wallets ON public.wallets;
CREATE TRIGGER log_activity_wallets
    AFTER INSERT OR UPDATE OR DELETE ON public.wallets
    FOR EACH ROW
    WHEN (coalesce(current_setting('app.silenciar_historial', true), '') <> 'on')
    EXECUTE FUNCTION public.log_activity();

-- ---------------------------------------------------------------- 3. Vaciar

/**
 * Vacía un espacio: da de baja todos sus movimientos y pone los saldos
 * iniciales en cero, dejando registro de lo que había.
 *
 * NO toca categorías, grupos, billeteras, deudas ni presupuestos: vaciar la caja
 * no es empezar la app de nuevo.
 *
 * El borrado es lógico. Un DELETE haría esto irreversible y no hay ninguna razón
 * para que lo sea.
 */
CREATE OR REPLACE FUNCTION public.vaciar_espacio(ws uuid, motivo text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id     uuid;
    v_saldos jsonb;
    v_filas  integer;
BEGIN
    IF NOT public.is_workspace_member(ws) THEN
        RAISE EXCEPTION 'No sos miembro de este espacio';
    END IF;

    PERFORM set_config('app.silenciar_historial', 'on', true);

    SELECT coalesce(jsonb_agg(jsonb_build_object('wallet_id', id, 'initial_balance', initial_balance)), '[]'::jsonb)
      INTO v_saldos
      FROM public.wallets
     WHERE workspace_id = ws AND deleted_at IS NULL AND initial_balance <> 0;

    INSERT INTO public.purges (workspace_id, user_id, reason, balances)
    VALUES (ws, public.current_user_id(), nullif(btrim(coalesce(motivo, '')), ''), v_saldos)
    RETURNING id INTO v_id;

    UPDATE public.transactions
       SET deleted_at = now(), purge_id = v_id
     WHERE workspace_id = ws AND deleted_at IS NULL;
    GET DIAGNOSTICS v_filas = ROW_COUNT;

    UPDATE public.wallets
       SET initial_balance = 0
     WHERE workspace_id = ws AND deleted_at IS NULL AND initial_balance <> 0;

    UPDATE public.purges SET transactions_count = v_filas WHERE id = v_id;

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------- 4. Restaurar

/**
 * Deshace un vaciado: revive sus movimientos y devuelve los saldos iniciales.
 *
 * Sólo revive lo que ESE vaciado dio de baja. Un movimiento que ya estaba
 * borrado de antes se queda borrado, que es lo que su dueño quiso.
 */
CREATE OR REPLACE FUNCTION public.restaurar_purga(purga uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ws    uuid;
    v_hecho timestamptz;
    v_filas integer;
BEGIN
    SELECT workspace_id, restored_at INTO v_ws, v_hecho FROM public.purges WHERE id = purga;

    IF v_ws IS NULL OR NOT public.is_workspace_member(v_ws) THEN
        RAISE EXCEPTION 'El vaciado no existe o no tenés acceso';
    END IF;
    IF v_hecho IS NOT NULL THEN
        RAISE EXCEPTION 'Ese vaciado ya se restauró el %', v_hecho::date;
    END IF;

    PERFORM set_config('app.silenciar_historial', 'on', true);

    UPDATE public.transactions
       SET deleted_at = NULL
     WHERE purge_id = purga AND deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_filas = ROW_COUNT;

    UPDATE public.wallets w
       SET initial_balance = (b.valor->>'initial_balance')::numeric
      FROM (SELECT jsonb_array_elements(balances) AS valor FROM public.purges WHERE id = purga) b
     WHERE w.id = (b.valor->>'wallet_id')::uuid;

    UPDATE public.purges SET restored_at = now() WHERE id = purga;

    RETURN v_filas;
END;
$$;

-- ---------------------------------------------------------------- 5. RLS

ALTER TABLE public.purges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purges_select ON public.purges;
CREATE POLICY purges_select ON public.purges
    FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

-- Sin políticas de INSERT ni UPDATE: un vaciado se hace y se deshace por las
-- funciones de arriba, que validan la membresía y dejan todo consistente. Un
-- INSERT suelto en esta tabla no vaciaría nada y sólo serviría para confundir.
GRANT SELECT ON public.purges TO authenticated;

REVOKE ALL ON FUNCTION public.vaciar_espacio(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.restaurar_purga(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.vaciar_espacio(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_purga(uuid) TO authenticated;
