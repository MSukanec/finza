-- 024 · Cierre de fugas entre espacios
--
-- Hallazgo: wallet_expected_balance era SECURITY DEFINER sin control de
-- membresía. SECURITY DEFINER saltea RLS por diseño, así que cualquier usuario
-- logueado que conociera (o adivinara) el uuid de una billetera podía leer su
-- saldo exacto aunque no viera ni una fila de ese espacio. Verificado: un
-- usuario ajeno veía 0 billeteras y leía 7.205.371 de una de Samurai.
--
-- Regla que queda: toda función SECURITY DEFINER que devuelva datos de un
-- espacio valida is_workspace_member() antes de devolver nada. Sin excepción.

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
             SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
               FROM public.transactions t
              WHERE t.wallet_id = w
                AND t.deleted_at IS NULL
                AND t.date <= at_time
           ), 0)
      INTO v_bal;

    RETURN v_bal;
END;
$$;

-- Estas no tienen por qué ser alcanzables sin sesión.
REVOKE ALL ON FUNCTION public.clone_workspace(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.current_user_id() FROM anon;
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_workspace_owner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.wallet_expected_balance(uuid, timestamptz) FROM anon;

-- Higiene: sin search_path fijo, un search_path manipulado puede cambiar a qué
-- objeto resuelve un nombre dentro de la función.
ALTER FUNCTION public.handle_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.entity_label(text) SET search_path = public, pg_temp;
