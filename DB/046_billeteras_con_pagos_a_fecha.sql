-- 046 · Qué billeteras aceptan pagos a fecha
--
-- "Se paga" (la fecha en que la plata sale de verdad, `settles_at`, DB/035)
-- aparecía en todo egreso e ingreso. Pedido del usuario el 2026-09-17: que
-- aparezca sólo donde puede pasar. Pagar con efectivo del mostrador es pagar en
-- el acto: el campo ahí sólo ocupa lugar.
--
-- Por eso depende de la BILLETERA, no del tipo de movimiento.
--
-- El nombre es general a propósito, y no "usa cheques": los datos muestran que
-- no son sólo cheques. Al 2026-09-17, los 238 egresos de Samurai pagados otro
-- día salieron de tres billeteras:
--
--     Banco Santander Río   banco      149   (cheques)
--     Mercado Pago          digital     60
--     Fábrica (Joe/Pey)     efectivo    29   (se compra a cuenta, se paga después)
--
-- Atarlo a "bancos" habría escondido el campo en 89 movimientos reales que lo
-- usan, sin forma de verlo ni corregirlo.
--
-- Ningún INGRESO usa la fecha de cobro. La app deja de ofrecerla en ingresos.

ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS allows_deferred_payment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.wallets.allows_deferred_payment IS
    'Desde esta billetera se puede pagar otro día que el del gasto: cheques, cuenta corriente con un proveedor. Habilita "Se paga" en el formulario.';

-- Se prende donde los datos dicen que hace falta, no por nombre ni por tipo:
-- toda billetera con al menos un egreso pagado otro día que el del gasto.
UPDATE public.wallets w
   SET allows_deferred_payment = true
 WHERE w.allows_deferred_payment = false
   AND EXISTS (
       SELECT 1 FROM public.transactions t
        WHERE t.wallet_id = w.id
          AND t.deleted_at IS NULL
          AND t.settles_at IS NOT NULL
          AND t.settles_at::date <> t.date::date
   );

-- ---------------------------------------------------------------- el colaborador
--
-- La encargada no lee `wallets` (la fila lleva el saldo inicial, DB/034): elige
-- billetera por esta función. Sin el dato nuevo, a ella nunca le aparecería
-- "Se paga", aunque cargue un gasto con cheque.
--
-- Se aprovecha para devolver también `parent_id`. Sin él, su formulario no
-- podía distinguir "Efectivo" (que agrupa y la base rechaza) de sus cajas, y le
-- ofrecía una opción que falla al guardar.
--
-- DROP + CREATE y no CREATE OR REPLACE porque cambian las columnas que
-- devuelve, y Postgres no permite cambiarlas en el lugar. Es una función, no
-- datos: no se pierde nada, y va dentro de la misma transacción.
DROP FUNCTION IF EXISTS public.billeteras_para_cargar(uuid);

CREATE FUNCTION public.billeteras_para_cargar(ws uuid)
RETURNS TABLE(
    id uuid,
    name text,
    type text,
    currency_code text,
    parent_id uuid,
    allows_deferred_payment boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_workspace_member(ws) THEN
        RAISE EXCEPTION 'No sos miembro de este espacio';
    END IF;

    -- Sigue sin saldos: nombre, moneda, jerarquía y si acepta pagos a fecha.
    RETURN QUERY
        SELECT w.id, w.name, w.type::text, w.currency_code, w.parent_id, w.allows_deferred_payment
          FROM public.wallets w
         WHERE w.workspace_id = ws AND w.deleted_at IS NULL
         ORDER BY w.name;
END;
$$;

REVOKE ALL ON FUNCTION public.billeteras_para_cargar(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billeteras_para_cargar(uuid) TO authenticated;
