-- 038 · Las tres cajas de efectivo de Samurai
--
-- No se inventa ni se mueve un peso. La "Efectivo" que ya existe se queda con
-- sus 410 movimientos y todo su historial: sólo cambia de nombre a "Caja
-- registradora", que es lo que realmente era. Encima se crea "Efectivo" como
-- cuenta que agrupa, y al lado las otras dos cajas en cero.
--
-- El reparto real lo van a definir los arqueos: cuando cuenten la caja fuerte y
-- la del socio, las diferencias van a acomodar la plata donde está. Poner
-- saldos iniciales a ojo sería adivinar.

BEGIN;

DO $$
DECLARE
    WS        uuid := '06a79300-cec3-49b1-841b-de5a032754f5';
    v_actual  uuid := '989aa5fa-ea68-475a-ad45-004fb43e942b';  -- la "Efectivo" en ARS, con los 410 movimientos
    v_dueno   uuid;
    v_padre   uuid;
BEGIN
    SELECT user_id INTO v_dueno FROM public.wallets WHERE id = v_actual;

    -- 1. La de siempre pasa a ser la caja del local. Conserva el id, así que
    --    ningún movimiento, arqueo ni historial se toca.
    UPDATE public.wallets
       SET name = 'Caja registradora', is_default = true
     WHERE id = v_actual;

    -- 2. La cuenta que agrupa. No recibe movimientos: su saldo es la suma.
    INSERT INTO public.wallets (workspace_id, user_id, name, type, currency_code, initial_balance)
    VALUES (WS, v_dueno, 'Efectivo', 'cash', 'ARS', 0)
    RETURNING id INTO v_padre;

    -- 3. Las tres cajas cuelgan de ella.
    UPDATE public.wallets SET parent_id = v_padre WHERE id = v_actual;

    INSERT INTO public.wallets (workspace_id, user_id, name, type, currency_code, initial_balance, parent_id)
    VALUES
        (WS, v_dueno, 'Caja fuerte',        'cash', 'ARS', 0, v_padre),
        (WS, v_dueno, 'Efectivo del socio', 'cash', 'ARS', 0, v_padre);
END $$;

COMMIT;
