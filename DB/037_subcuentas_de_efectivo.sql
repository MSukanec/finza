-- 037 · Billeteras con subcuentas: una caja física, una cuenta
--
-- El efectivo del restaurante vive en tres lugares: la caja registradora del
-- local, la caja fuerte y lo que un socio se lleva a la casa. La app tenía una
-- sola billetera "Efectivo", así que sabía cuánto efectivo hay en total pero no
-- cuánto debería haber en cada lado.
--
-- Eso ya rompió: el 10-09 alguien contó $7.000.000 contra $25.996.181
-- esperados y quedó una alerta de $18.996.181 faltantes. Casi seguro no falta
-- nada — contó la caja que tiene a mano y el resto está en las otras dos.
--
-- El patrón es el del plan de cuentas: un árbol. "Efectivo" pasa a ser una
-- cuenta de control que sólo agrupa, y las cajas reales son sus hijas. Los
-- movimientos se cargan en una hoja, el saldo del padre es la suma de las
-- hojas, y el arqueo se hace por hoja. Es lo que QuickBooks y Xero llaman
-- subcuentas y lo que GnuCash tiene nativo.
--
-- Los pases entre cajas —cierre de caja a la caja fuerte, el socio que se lleva
-- plata— son TRANSFERENCIAS, que la app ya sabe hacer. No hace falta nada nuevo
-- para eso: son movimientos reales entre cuentas reales.

BEGIN;

-- ---------------------------------------------------------------- 1. Árbol

ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.wallets(id) ON DELETE RESTRICT;

-- La billetera que el formulario propone cuando hay varias hermanas. Sin esto,
-- separar el efectivo en tres agregaría una decisión a cada carga.
ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS wallets_parent_idx ON public.wallets (parent_id)
    WHERE parent_id IS NOT NULL;

-- Un solo nivel. Un árbol profundo suena más general pero acá no resuelve nada
-- y complica cada suma: una caja no tiene sub-cajas.
CREATE OR REPLACE FUNCTION public.check_wallet_depth()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        IF NEW.parent_id = NEW.id THEN
            RAISE EXCEPTION 'Una billetera no puede ser su propia cuenta madre';
        END IF;
        IF EXISTS (SELECT 1 FROM public.wallets w WHERE w.id = NEW.parent_id AND w.parent_id IS NOT NULL) THEN
            RAISE EXCEPTION 'Sólo se permite un nivel de subcuentas';
        END IF;
        IF EXISTS (SELECT 1 FROM public.wallets w WHERE w.parent_id = NEW.id) THEN
            RAISE EXCEPTION 'Esta billetera ya tiene subcuentas: no puede colgar de otra';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallets_depth ON public.wallets;
CREATE TRIGGER wallets_depth BEFORE INSERT OR UPDATE OF parent_id ON public.wallets
    FOR EACH ROW EXECUTE FUNCTION public.check_wallet_depth();

-- Una cuenta que agrupa no recibe movimientos: si los recibiera, su saldo
-- dejaría de ser la suma de sus hijas y no habría forma de arquearla.
CREATE OR REPLACE FUNCTION public.check_wallet_is_leaf()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.wallet_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.wallets w WHERE w.parent_id = NEW.wallet_id AND w.deleted_at IS NULL)
    THEN
        RAISE EXCEPTION 'Esa billetera agrupa subcuentas: el movimiento va en una de ellas';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_wallet_leaf ON public.transactions;
CREATE TRIGGER transactions_wallet_leaf BEFORE INSERT OR UPDATE OF wallet_id ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.check_wallet_is_leaf();

-- ---------------------------------------------------------------- 2. Saldos

/**
 * Saldo de una billetera, sumando sus subcuentas si las tiene.
 *
 * Para una hoja es lo de siempre. Para una cuenta que agrupa es la suma de sus
 * hijas, que es lo que significa "cuánto efectivo hay": el total repartido
 * entre las cajas.
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

    WITH alcance AS (
        -- La propia más sus subcuentas. Para una hoja, sólo la propia.
        SELECT id, initial_balance FROM public.wallets
         WHERE (id = w OR parent_id = w) AND deleted_at IS NULL
    )
    SELECT COALESCE(SUM(a.initial_balance), 0)
         + COALESCE((
             SELECT SUM(
                 CASE WHEN t.type IN ('income', 'contribution') THEN t.amount ELSE -t.amount END
             )
               FROM public.transactions t
              WHERE t.wallet_id IN (SELECT id FROM alcance)
                AND t.deleted_at IS NULL
                AND COALESCE(t.settles_at, t.date) <= at_time
           ), 0)
      INTO v_bal
      FROM alcance a;

    RETURN v_bal;
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_expected_balance(uuid, timestamptz) FROM anon;

COMMIT;
