-- ============================================================
-- Las 5 filas "GENERAL - TICKET Z" del Excel de Samurai.
--
-- Vienen sin CATEGORIA ni SUBCATEGORIA, así que el importador no las pudo
-- ubicar. Son los cierres mensuales de caja (último día de cada mes, entre
-- 3,4M y 5M, todos por Banco Santander Río) y suman ~18,3M: descartarlas
-- dejaría los totales mal.
--
-- Se las cuelga de "Otros > Ticket Z" por ser el macro comodín que ya usa la
-- planilla. Si preferís otro lugar, se mueven cambiando category_id.
--
-- Comparte import_batch con la carga principal para poder revertir todo junto.
-- ============================================================

DO $$
DECLARE
    v_ws     uuid;
    v_user   uuid;
    v_grp    uuid;
    v_cat    uuid;
    v_wallet uuid;
    v_batch  text := 'xls-20260910130333';
    f        record;
BEGIN
    SELECT id, user_id INTO v_ws, v_user FROM public.workspaces WHERE name = 'Samurai';
    IF v_ws IS NULL THEN RAISE EXCEPTION 'No existe el espacio "Samurai"'; END IF;

    SELECT id INTO v_grp FROM public.category_groups
     WHERE workspace_id = v_ws AND name = 'Otros';

    SELECT id INTO v_cat FROM public.categories
     WHERE workspace_id = v_ws AND group_id = v_grp AND name = 'Ticket Z';
    IF v_cat IS NULL THEN
        INSERT INTO public.categories
            (user_id, name, type, group_name, group_id, is_recurring, workspace_id)
        VALUES (v_user, 'Ticket Z', 'expense', 'Otros', v_grp, true, v_ws)
        RETURNING id INTO v_cat;
    END IF;

    SELECT id INTO v_wallet FROM public.wallets
     WHERE workspace_id = v_ws AND name = 'Banco Santander Río' AND currency_code = 'ARS';
    IF v_wallet IS NULL THEN RAISE EXCEPTION 'No encuentro la billetera Banco Santander Río (ARS)'; END IF;

    FOR f IN
        SELECT * FROM (VALUES
            ('2026-04-30'::date, 4977264::numeric),
            ('2026-05-31'::date, 3427454::numeric),
            ('2026-06-30'::date, 3543790::numeric),
            ('2026-07-31'::date, 3455190::numeric),
            ('2026-08-31'::date, 3919380::numeric)
        ) AS t(fecha, monto)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.transactions
             WHERE workspace_id = v_ws
               AND description = 'GENERAL - TICKET Z'
               AND date::date = f.fecha
        ) THEN
            INSERT INTO public.transactions
                (user_id, wallet_id, category_id, type, amount, currency_code, description,
                 date, invoiced_at, import_batch, is_checkpoint, status, workspace_id)
            VALUES (v_user, v_wallet, v_cat, 'expense', f.monto, 'ARS', 'GENERAL - TICKET Z',
                    f.fecha + time '12:00', f.fecha + time '12:00', v_batch, false, 'draft', v_ws);
        END IF;
    END LOOP;
END $$;
