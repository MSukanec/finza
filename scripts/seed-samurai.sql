-- ============================================================
-- Carga la estructura del Excel de Samurai (hoja CONFIG) en el espacio
-- "Samurai". 2026-09-10.
--
-- Transcrito de las capturas del CONFIG. Es IDEMPOTENTE: se puede correr
-- de nuevo y no duplica nada.
--
-- Modelo de la app:
--   Excel "CATEGORIA"     -> public.category_groups  (macro)
--   Excel "SUBCATEGORIA"  -> public.categories       (lleva el type income/expense)
--   Excel "BILLETERA"     -> public.wallets
--
-- Las macro sin subcategoría reciben una categoría "General", que es la
-- convención que ya usa el espacio Principal.
--
-- Correr con:  node scripts/db.mjs --tx -f scripts/seed-samurai.sql
-- ============================================================

DO $$
DECLARE
    v_ws   uuid;
    v_user uuid;
    v_grp  uuid;
    -- macro -> tipo. "Eventos" y "Movimientos" existen en Ingreso Y Egreso:
    -- el grupo es uno solo y cada categoría lleva su propio type.
    grupos_ingreso text[] := ARRAY[
        'Aportes','Delivery + Takeaway','Eventos','Movimientos','Salon'
    ];
    grupos_egreso text[] := ARRAY[
        'Alquiler','Bebidas','Comidas','DEUDAS','DIARIO','Empleados','Eventos',
        'Gastos Bancarios','Gastos Legales y Contables','Impuestos','Infraestructura',
        'Insumos Delivery','Insumos Restaurante','Movimientos','Otros','Recursos Humanos',
        'Seguridad e Higiene','Servicios Generales','Servicios Profesionales',
        'Software y Tecnología'
    ];
    -- (grupo, subcategoría, tipo)
    subcats text[][] := ARRAY[
        ['Bebidas','Bebidas alcohólicas','expense'],
        ['Bebidas','Bebidas sin alcohol','expense'],
        ['Bebidas','Insumos para coctelería','expense'],

        ['Empleados','Bachero','expense'],
        ['Empleados','Encargado','expense'],
        ['Empleados','Jefe Cocina','expense'],
        ['Empleados','Jefe de Barra','expense'],
        ['Empleados','Ayudante de Barra','expense'],
        ['Empleados','Ayudante de Cocina','expense'],
        ['Empleados','Mozo','expense'],
        ['Empleados','Adicionista','expense'],
        ['Empleados','TOTAL','expense'],

        ['Comidas','Carnicería','expense'],
        ['Comidas','Almacen','expense'],
        ['Comidas','Insumos Orientales','expense'],
        ['Comidas','Verdulería','expense'],
        ['Comidas','Salmón','expense'],
        ['Comidas','Otros Pescados','expense'],

        ['Otros','Gastos Operativos','expense'],
        ['Otros','Delivery','expense'],
        ['Otros','Propinas','expense'],

        ['Impuestos','IIBB - PBA','expense'],
        ['Impuestos','IVA - ARCA','expense'],
        ['Impuestos','Autónomos','expense'],

        ['Servicios Generales','Internet','expense'],
        ['Servicios Generales','Electicidad','expense'],
        ['Servicios Generales','Expensas','expense'],
        ['Servicios Generales','Agua','expense'],
        ['Servicios Generales','Gas','expense'],
        -- Estas tres no están en las columnas del CONFIG que vi, pero SÍ se usan
        -- en la hoja MOVIMIENTOS, así que hacen falta para que los movimientos matcheen.
        ['Servicios Generales','Luz','expense'],
        ['Servicios Profesionales','Honorarios Contador','expense'],
        ['Infraestructura','Expensas / Servicios comunes','expense']
    ];
    -- (nombre, tipo de billetera, moneda)
    billeteras text[][] := ARRAY[
        ['Banco Santander Río','bank','ARS'],
        ['Efectivo','cash','ARS'],
        ['Mercado Pago','digital','ARS'],
        ['Banco Santander Río','bank','USD'],
        ['Efectivo','cash','USD']
    ];
    i int;
BEGIN
    SELECT id, user_id INTO v_ws, v_user FROM public.workspaces WHERE name = 'Samurai';
    IF v_ws IS NULL THEN
        RAISE EXCEPTION 'No existe el espacio "Samurai"';
    END IF;

    -- ---------- Grupos (categorías macro) ----------
    FOR i IN 1 .. array_length(grupos_ingreso || grupos_egreso, 1) LOOP
        DECLARE
            nombre text := (grupos_ingreso || grupos_egreso)[i];
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM public.category_groups
                 WHERE workspace_id = v_ws AND name = nombre
            ) THEN
                INSERT INTO public.category_groups (user_id, name, is_system, workspace_id)
                VALUES (v_user, nombre, false, v_ws);
            END IF;
        END;
    END LOOP;

    -- ---------- Categoría "General" por cada macro ----------
    -- Cubre las macro sin subcategoría y sirve de fallback cuando el Excel
    -- trae CATEGORIA pero la columna SUBCATEGORIA viene vacía.
    FOR i IN 1 .. array_length(grupos_ingreso, 1) LOOP
        SELECT id INTO v_grp FROM public.category_groups
         WHERE workspace_id = v_ws AND name = grupos_ingreso[i];
        IF NOT EXISTS (
            SELECT 1 FROM public.categories
             WHERE workspace_id = v_ws AND group_id = v_grp AND name = 'General' AND type = 'income'
        ) THEN
            INSERT INTO public.categories (user_id, name, type, group_name, group_id, is_recurring, workspace_id)
            VALUES (v_user, 'General', 'income', grupos_ingreso[i], v_grp, false, v_ws);
        END IF;
    END LOOP;

    FOR i IN 1 .. array_length(grupos_egreso, 1) LOOP
        SELECT id INTO v_grp FROM public.category_groups
         WHERE workspace_id = v_ws AND name = grupos_egreso[i];
        IF NOT EXISTS (
            SELECT 1 FROM public.categories
             WHERE workspace_id = v_ws AND group_id = v_grp AND name = 'General' AND type = 'expense'
        ) THEN
            INSERT INTO public.categories (user_id, name, type, group_name, group_id, is_recurring, workspace_id)
            VALUES (v_user, 'General', 'expense', grupos_egreso[i], v_grp, false, v_ws);
        END IF;
    END LOOP;

    -- ---------- Subcategorías ----------
    FOR i IN 1 .. array_length(subcats, 1) LOOP
        SELECT id INTO v_grp FROM public.category_groups
         WHERE workspace_id = v_ws AND name = subcats[i][1];
        IF v_grp IS NULL THEN
            RAISE EXCEPTION 'Falta el grupo "%" para la subcategoría "%"', subcats[i][1], subcats[i][2];
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.categories
             WHERE workspace_id = v_ws AND group_id = v_grp AND name = subcats[i][2]
        ) THEN
            INSERT INTO public.categories (user_id, name, type, group_name, group_id, is_recurring, workspace_id)
            VALUES (v_user, subcats[i][2], subcats[i][3]::public.category_type,
                    subcats[i][1], v_grp, false, v_ws);
        END IF;
    END LOOP;

    -- ---------- Billeteras ----------
    FOR i IN 1 .. array_length(billeteras, 1) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.wallets
             WHERE workspace_id = v_ws AND name = billeteras[i][1] AND currency_code = billeteras[i][3]
        ) THEN
            INSERT INTO public.wallets (user_id, name, type, currency_code, initial_balance, workspace_id)
            VALUES (v_user, billeteras[i][1], billeteras[i][2]::public.wallet_type,
                    billeteras[i][3], 0, v_ws);
        END IF;
    END LOOP;
END $$;
