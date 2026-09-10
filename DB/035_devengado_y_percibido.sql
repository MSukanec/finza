-- 035 · Separar cuándo pasó el gasto de cuándo sale la plata
--
-- Cada compra a plazo tiene dos momentos y los dos son reales:
--
--   · La pescadería entregó el pescado el 15 de julio. Ese pescado se vendió en
--     julio, así que el costo es de julio.  → DEVENGADO
--   · El cheque se cobra el 11 de septiembre. Recién ahí el banco debita.
--     → PERCIBIDO
--
-- Responden preguntas distintas: "¿ganó plata el restaurante en julio?" y
-- "¿voy a tener plata el 11 de septiembre?". Un restaurante puede ser rentable
-- y quedarse sin caja el martes.
--
-- Qué había: la app usaba un solo campo, `date`, para las dos cosas, y ahí
-- estaba cargada la fecha del CHEQUE. La fecha real de la factura estaba en
-- `invoiced_at`. Resultado: 226 movimientos por $141.170.081 con 34 días de
-- desfase promedio. Abril figuraba con $30,1 M de egresos cuando fueron
-- $40,5 M; agosto con $29,1 M cuando fueron $19,7 M; y octubre y noviembre
-- mostraban gastos de meses que todavía no ocurrieron.
--
-- Qué NO estaba mal: la caja. Como el saldo corta en `date <= hoy` y ahí estaba
-- la fecha del cheque, los cheques sin cobrar no se descontaban. Por eso este
-- cambio mueve las fechas Y la función de saldo a la vez: si se moviera sólo la
-- fecha, la caja pasaría a descontar cheques que todavía no se cobraron.

BEGIN;

-- ---------------------------------------------------------------- 1. Columna

-- Cuándo se mueve la plata. NULL = se paga el mismo día del hecho (contado),
-- que es el caso de la enorme mayoría de los movimientos.
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS settles_at timestamptz;

COMMENT ON COLUMN public.transactions.settles_at IS
    'Cuándo se mueve la plata, si es distinto del hecho. NULL = contado. '
    'Manda en saldos y flujo de caja; `date` manda en resultados.';

CREATE INDEX IF NOT EXISTS transactions_settles_idx
    ON public.transactions (workspace_id, settles_at)
    WHERE settles_at IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------- 2. Migración

-- El disparador del historial se apaga: esto es una corrección de datos, no una
-- acción de un usuario, y prendido generaría cientos de entradas.
ALTER TABLE public.transactions DISABLE TRIGGER log_activity_transactions;

-- Donde las dos fechas difieren, `date` tenía la del cheque y `invoiced_at` la
-- de la factura. Cada una va a su lugar.
UPDATE public.transactions
   SET settles_at = date,
       date       = invoiced_at
 WHERE invoiced_at IS NOT NULL
   AND invoiced_at::date <> date::date;

ALTER TABLE public.transactions ENABLE TRIGGER log_activity_transactions;

-- ---------------------------------------------------------------- 3. La caja

/**
 * Saldo de una billetera.
 *
 * Cuenta por `settles_at` y no por `date`: un cheque emitido en julio con
 * fecha de cobro en septiembre no toca la caja hasta septiembre. Sin este
 * cambio, mover las fechas habría hecho que la caja descontara compras que
 * todavía no se pagaron.
 */
CREATE OR REPLACE FUNCTION public.wallet_expected_balance(
    w uuid,
    at_time timestamptz DEFAULT now()
)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ws  uuid;
    v_bal numeric;
BEGIN
    SELECT workspace_id INTO v_ws FROM public.wallets WHERE id = w;

    -- Mismo mensaje para "no existe" y "no sos miembro": distinguirlos
    -- convertiría la función en un detector de billeteras ajenas.
    IF v_ws IS NULL OR NOT public.is_workspace_member(v_ws) THEN
        RAISE EXCEPTION 'La billetera no existe o no tenés acceso';
    END IF;

    SELECT COALESCE((SELECT initial_balance FROM public.wallets WHERE id = w), 0)
         + COALESCE((
             SELECT SUM(
                 CASE WHEN t.type IN ('income', 'contribution') THEN t.amount ELSE -t.amount END
             )
               FROM public.transactions t
              WHERE t.wallet_id = w
                AND t.deleted_at IS NULL
                AND COALESCE(t.settles_at, t.date) <= at_time
           ), 0)
      INTO v_bal;

    RETURN v_bal;
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_expected_balance(uuid, timestamptz) FROM anon;

-- ------------------------------------------------- 4. Qué está por vencer

/**
 * Los pagos comprometidos que todavía no se movieron.
 *
 * Es la respuesta a "¿cuánta plata necesito la semana que viene?". Con 22
 * cheques por $14.117.822 en la calle, esa pregunta no se contesta de memoria.
 */
CREATE OR REPLACE FUNCTION public.pending_settlements(ws uuid)
RETURNS TABLE (
    id           uuid,
    settles_at   timestamptz,
    date         timestamptz,
    type         text,
    amount       numeric,
    description  text,
    wallet_id    uuid,
    wallet_name  text,
    category_id  uuid,
    dias         integer
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
    SELECT t.id,
           t.settles_at,
           t.date,
           t.type::text,
           t.amount,
           t.description,
           t.wallet_id,
           w.name,
           t.category_id,
           (t.settles_at::date - CURRENT_DATE)::int
      FROM public.transactions t
      LEFT JOIN public.wallets w ON w.id = t.wallet_id
     WHERE t.workspace_id = ws
       AND t.deleted_at IS NULL
       AND t.settles_at IS NOT NULL
       AND t.settles_at > now()
     ORDER BY t.settles_at;
END;
$$;

REVOKE ALL ON FUNCTION public.pending_settlements(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pending_settlements(uuid) TO authenticated;

COMMIT;

-- ------------------------------------------------- 5. El que quedó suelto

-- Un movimiento tenía la misma fecha en los dos campos, así que la migración de
-- arriba no lo tocó. El detalle dice "Pedido del 24-8-2026 y pagado con cheque"
-- y la fecha cargada era 24-9: el pedido es de agosto y el cheque de
-- septiembre. Es el único caso y la descripción no deja lugar a dudas.
BEGIN;
ALTER TABLE public.transactions DISABLE TRIGGER log_activity_transactions;

UPDATE public.transactions
   SET date       = date - interval '1 month',
       settles_at = date
 WHERE workspace_id = '06a79300-cec3-49b1-841b-de5a032754f5'
   AND deleted_at IS NULL
   AND settles_at IS NULL
   AND date > now()
   AND description LIKE 'Saiz Caputo - Descartables. Pedido del 24-8-2026%';

ALTER TABLE public.transactions ENABLE TRIGGER log_activity_transactions;
COMMIT;
