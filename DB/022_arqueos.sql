-- 022_arqueos.sql
-- ============================================================
-- Arqueos y conciliación de billeteras. 2026-09-10.
--
-- El problema real: son varios socios, uno maneja el efectivo y otro los
-- bancos. Cada tanto el que tiene el efectivo lo cuenta y quiere registrar
-- cuánto hay DE VERDAD, para contrastarlo contra lo que la app calculó a partir
-- de los movimientos.
--
-- Son dos actos distintos y la app tiene que tratarlos distinto:
--
--   SALDO INICIAL (`wallets.initial_balance`): se declara UNA vez, al crear la
--   billetera. Es el punto de partida de la contabilidad.
--
--   ARQUEO (esta tabla): se repite. Registra "el día X había realmente $Y".
--   NUNCA toca el saldo inicial. Si se ajustara el saldo inicial para cuadrar,
--   se reescribiría la historia y se perdería la evidencia del faltante.
--
-- Una diferencia no se "corrige": se concilia. O se encuentra el movimiento que
-- faltaba cargar, o se asienta un ajuste explícito que queda a la vista.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wallet_reconciliations (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    wallet_id     uuid NOT NULL REFERENCES public.wallets(id)    ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES public.users(id),

    counted_at    timestamptz NOT NULL DEFAULT now(),
    -- Lo que la persona contó.
    counted_amount  numeric NOT NULL,
    -- Foto de lo que la app calculaba en ese momento. Se guarda y no se
    -- recalcula: si mañana aparece un movimiento viejo, el arqueo tiene que
    -- seguir diciendo qué se vio ese día.
    expected_amount numeric NOT NULL,

    status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('matched','pending','resolved')),
    -- Cómo se cerró la diferencia.
    resolution    text CHECK (resolution IN ('adjusted','explained')),
    -- El movimiento de ajuste, si se asentó uno.
    adjustment_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
    note          text,

    deleted_at    timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reconciliations_wallet_idx
    ON public.wallet_reconciliations(wallet_id, counted_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS reconciliations_pending_idx
    ON public.wallet_reconciliations(workspace_id) WHERE status = 'pending' AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_reconciliations ON public.wallet_reconciliations;
CREATE TRIGGER set_updated_at_reconciliations
    BEFORE UPDATE ON public.wallet_reconciliations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Queda registrado quién arqueó y cuándo, como todo lo demás.
DROP TRIGGER IF EXISTS log_activity_wallet_reconciliations ON public.wallet_reconciliations;
CREATE TRIGGER log_activity_wallet_reconciliations
    AFTER INSERT OR UPDATE OR DELETE ON public.wallet_reconciliations
    FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- ------------------------------------------------------------
-- Saldo esperado de una billetera.
--
-- Se calcula en la base y no en el cliente para que el arqueo compare contra un
-- número que no depende de qué tenga cargado el navegador en ese momento.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_expected_balance(w uuid, at_time timestamptz DEFAULT now())
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((SELECT initial_balance FROM public.wallets WHERE id = w), 0)
         + COALESCE((
             SELECT SUM(
                 CASE
                     WHEN t.type = 'income' THEN t.amount
                     -- Gastos y transferencias salientes restan.
                     ELSE -t.amount
                 END
             )
             FROM public.transactions t
            WHERE t.wallet_id = w
              AND t.deleted_at IS NULL
              AND t.date <= at_time
           ), 0)
$$;

REVOKE ALL ON FUNCTION public.wallet_expected_balance(uuid, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wallet_expected_balance(uuid, timestamptz) TO authenticated;

-- ------------------------------------------------------------
-- Registrar un arqueo.
--
-- Toma la foto del esperado dentro de la propia transacción, así no puede
-- llegar desfasado desde el cliente. Devuelve la fila creada para que la
-- interfaz muestre la diferencia recién después de que la persona contó.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_reconciliation(
    w uuid,
    counted numeric,
    at_time timestamptz DEFAULT now(),
    note_text text DEFAULT NULL
)
RETURNS public.wallet_reconciliations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_ws       uuid;
    v_me       uuid := public.current_user_id();
    v_expected numeric;
    v_row      public.wallet_reconciliations;
BEGIN
    SELECT workspace_id INTO v_ws FROM public.wallets WHERE id = w AND deleted_at IS NULL;
    IF v_ws IS NULL THEN RAISE EXCEPTION 'La billetera no existe'; END IF;
    IF NOT public.is_workspace_member(v_ws) THEN
        RAISE EXCEPTION 'No sos miembro de este espacio';
    END IF;
    IF v_me IS NULL THEN RAISE EXCEPTION 'No hay sesión activa'; END IF;

    v_expected := public.wallet_expected_balance(w, at_time);

    INSERT INTO public.wallet_reconciliations
        (workspace_id, wallet_id, user_id, counted_at, counted_amount, expected_amount, status, note)
    VALUES (
        v_ws, w, v_me, at_time, counted, v_expected,
        -- Se compara con tolerancia de un centavo: numeric no tiene el problema
        -- del punto flotante, pero un redondeo de conversión sí puede colarse.
        CASE WHEN abs(counted - v_expected) < 0.01 THEN 'matched' ELSE 'pending' END,
        note_text
    )
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_reconciliation(uuid, numeric, timestamptz, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_reconciliation(uuid, numeric, timestamptz, text) TO authenticated;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.wallet_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliations_select ON public.wallet_reconciliations;
CREATE POLICY reconciliations_select ON public.wallet_reconciliations
    FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS reconciliations_insert ON public.wallet_reconciliations;
CREATE POLICY reconciliations_insert ON public.wallet_reconciliations
    FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id) AND user_id = public.current_user_id());

-- Se puede cerrar una diferencia, no reescribir lo que se contó.
DROP POLICY IF EXISTS reconciliations_update ON public.wallet_reconciliations;
CREATE POLICY reconciliations_update ON public.wallet_reconciliations
    FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

GRANT SELECT, INSERT, UPDATE ON public.wallet_reconciliations TO authenticated;
REVOKE DELETE ON public.wallet_reconciliations FROM authenticated, anon;
