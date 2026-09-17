-- 047 · Borrar categorías y macrogrupos, con reemplazo
--
-- Pedido del usuario el 2026-09-17: al borrar una categoría o un macrogrupo, la
-- app tiene que decir si está en uso. Si no lo está, se borra. Si lo está, se
-- elige con qué reemplazarlo y se migra todo antes de borrar.
--
-- Hasta acá:
--   - "En uso" lo calculaba la pantalla con los movimientos que tenía cargados.
--     No contaba deudas, presupuestos, reglas de importación ni movimientos
--     dados de baja (que un vaciado puede revivir).
--   - Reemplazar migraba movimientos y deudas. Presupuestos y reglas quedaban
--     apuntando a una categoría borrada.
--   - Un macrogrupo no se podía borrar.
--
-- Todo pasa en la base y en UNA transacción: o se migra todo y se borra, o no
-- cambia nada. Las funciones son SECURITY DEFINER porque tienen que mover
-- movimientos de otras personas (DB/045 sólo deja editar los propios), así que
-- cada una se guarda con `can_see_all`, igual que administrar categorías.

-- ============================================================ 1. nombre del grupo
--
-- `categories.group_name` repite el nombre de `category_groups`. Nada lo
-- mantenía igual, y la pantalla agrupa por ese texto: al 2026-09-17 había seis
-- categorías mostrándose en el grupo equivocado ("Préstamo Papa" decía
-- "General" y está en "Deudas"). La fuente de verdad es `group_id`; el nombre
-- lo copia la base.

CREATE OR REPLACE FUNCTION public.copiar_nombre_de_grupo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    SELECT g.name INTO NEW.group_name FROM public.category_groups g WHERE g.id = NEW.group_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS copiar_nombre_de_grupo ON public.categories;
CREATE TRIGGER copiar_nombre_de_grupo
    BEFORE INSERT OR UPDATE OF group_id, group_name ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.copiar_nombre_de_grupo();

-- Renombrar un grupo renombra lo que sus categorías dicen de él.
CREATE OR REPLACE FUNCTION public.propagar_nombre_de_grupo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.categories SET group_name = NEW.name
     WHERE group_id = NEW.id AND group_name IS DISTINCT FROM NEW.name;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS propagar_nombre_de_grupo ON public.category_groups;
CREATE TRIGGER propagar_nombre_de_grupo
    AFTER UPDATE OF name ON public.category_groups
    FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
    EXECUTE FUNCTION public.propagar_nombre_de_grupo();

-- Las seis que ya estaban mal. Sin historial: no es una edición de nadie, es
-- una corrección de datos, y seis entradas de "editó categoría" confundirían.
SET LOCAL session_replication_role = replica;
UPDATE public.categories c
   SET group_name = g.name
  FROM public.category_groups g
 WHERE g.id = c.group_id
   AND c.group_name IS DISTINCT FROM g.name;
SET LOCAL session_replication_role = origin;

-- ============================================================ 2. categorías

/**
 * En qué está usada una categoría. Cuenta lo que la pantalla no ve.
 */
CREATE OR REPLACE FUNCTION public.uso_de_categoria(cat uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ws uuid;
    v    jsonb;
BEGIN
    SELECT workspace_id INTO v_ws FROM public.categories WHERE id = cat AND deleted_at IS NULL;
    IF v_ws IS NULL THEN
        RAISE EXCEPTION 'Categoría no encontrada';
    END IF;
    IF NOT public.can_see_all(v_ws) THEN
        RAISE EXCEPTION 'No tenés acceso para administrar las categorías de este espacio';
    END IF;

    SELECT jsonb_build_object(
        'movimientos',        (SELECT count(*) FROM public.transactions t WHERE t.category_id = cat AND t.deleted_at IS NULL),
        -- Dados de baja pero recuperables: un vaciado se deshace. Si no se
        -- migraran, volverían apuntando a una categoría que ya no existe.
        'movimientos_de_baja',(SELECT count(*) FROM public.transactions t WHERE t.category_id = cat AND t.deleted_at IS NOT NULL),
        'deudas',             (SELECT count(*) FROM public.debts d WHERE d.category_id = cat AND d.deleted_at IS NULL),
        'presupuestos',       (SELECT count(*) FROM public.budget_categories b JOIN public.budgets p ON p.id = b.budget_id
                                WHERE b.category_id = cat AND p.deleted_at IS NULL),
        'reglas',             (SELECT count(*) FROM public.import_rules r WHERE r.category_id = cat AND r.deleted_at IS NULL)
    ) INTO v;

    RETURN v || jsonb_build_object(
        'total',
        (v->>'movimientos')::int + (v->>'movimientos_de_baja')::int + (v->>'deudas')::int
        + (v->>'presupuestos')::int + (v->>'reglas')::int
    );
END;
$$;

/**
 * Borra una categoría. Si está en uso, exige con cuál reemplazarla y migra todo
 * a esa antes de borrar.
 *
 * El reemplazo tiene que ser del mismo espacio y del MISMO TIPO: pasar gastos a
 * una categoría de ingresos los contaría como ingresos en el resultado.
 *
 * Un presupuesto que ya tenía las dos categorías se queda con una sola, con la
 * suma de los dos límites: si el mes pasado se permitían $100 de pescadería y
 * $50 de carnicería, fusionadas son $150 de lo mismo.
 */
CREATE OR REPLACE FUNCTION public.borrar_categoria(cat uuid, reemplazo uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cat   public.categories%ROWTYPE;
    v_dest  public.categories%ROWTYPE;
    v_uso   jsonb;
BEGIN
    SELECT * INTO v_cat FROM public.categories WHERE id = cat AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Categoría no encontrada';
    END IF;

    -- También verifica el acceso.
    v_uso := public.uso_de_categoria(cat);

    IF reemplazo IS NULL THEN
        IF (v_uso->>'total')::int > 0 THEN
            RAISE EXCEPTION 'La categoría "%" está en uso: elegí con cuál reemplazarla', v_cat.name;
        END IF;
    ELSE
        SELECT * INTO v_dest FROM public.categories WHERE id = reemplazo AND deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La categoría de reemplazo no existe';
        END IF;
        IF v_dest.id = v_cat.id THEN
            RAISE EXCEPTION 'Una categoría no se puede reemplazar por sí misma';
        END IF;
        IF v_dest.workspace_id <> v_cat.workspace_id THEN
            RAISE EXCEPTION 'La categoría de reemplazo es de otro espacio';
        END IF;
        IF v_dest.type <> v_cat.type THEN
            RAISE EXCEPTION 'Una categoría de % no se puede reemplazar por una de %',
                CASE v_cat.type::text WHEN 'income' THEN 'ingresos' ELSE 'egresos' END,
                CASE v_dest.type::text WHEN 'income' THEN 'ingresos' ELSE 'egresos' END;
        END IF;

        -- Movimientos, vivos y dados de baja, de quien sean.
        PERFORM public.transferir_categoria(cat, reemplazo);

        UPDATE public.debts SET category_id = reemplazo WHERE category_id = cat;

        -- Presupuestos que ya tenían el reemplazo: se suman los límites.
        UPDATE public.budget_categories destino
           SET limit_amount = destino.limit_amount + origen.limit_amount
          FROM public.budget_categories origen
         WHERE origen.category_id = cat
           AND destino.category_id = reemplazo
           AND destino.budget_id = origen.budget_id;
        DELETE FROM public.budget_categories origen
         WHERE origen.category_id = cat
           AND EXISTS (SELECT 1 FROM public.budget_categories d
                        WHERE d.budget_id = origen.budget_id AND d.category_id = reemplazo);
        UPDATE public.budget_categories SET category_id = reemplazo WHERE category_id = cat;

        UPDATE public.import_rules SET category_id = reemplazo WHERE category_id = cat;
    END IF;

    UPDATE public.categories SET deleted_at = now() WHERE id = cat;

    RETURN v_uso;
END;
$$;

-- ============================================================ 3. macrogrupos

/** En qué está usado un macrogrupo: sus categorías, y lo que cuelga de ellas. */
CREATE OR REPLACE FUNCTION public.uso_de_grupo(grupo uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_grupo public.category_groups%ROWTYPE;
BEGIN
    SELECT * INTO v_grupo FROM public.category_groups WHERE id = grupo AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Macrogrupo no encontrado';
    END IF;
    -- Un grupo de sistema lo usan todos los espacios. Se cuenta sólo lo del
    -- espacio activo de quien pregunta, que es lo que puede ver.
    IF v_grupo.workspace_id IS NOT NULL AND NOT public.can_see_all(v_grupo.workspace_id) THEN
        RAISE EXCEPTION 'No tenés acceso para administrar las categorías de este espacio';
    END IF;

    RETURN (
        SELECT jsonb_build_object(
            'categorias_de_egreso',  count(*) FILTER (WHERE c.type::text = 'expense'),
            'categorias_de_ingreso', count(*) FILTER (WHERE c.type::text = 'income'),
            'categorias',            count(*),
            'movimientos',           coalesce(sum((SELECT count(*) FROM public.transactions t
                                                    WHERE t.category_id = c.id AND t.deleted_at IS NULL)), 0),
            'total',                 count(*)
        )
          FROM public.categories c
         WHERE c.group_id = grupo
           AND c.deleted_at IS NULL
           AND (v_grupo.workspace_id IS NOT NULL OR public.can_see_all(c.workspace_id))
    );
END;
$$;

/**
 * Borra un macrogrupo. Si tiene categorías, exige a qué grupo pasarlas.
 *
 * Una categoría que en el destino ya existe —mismo nombre y mismo tipo— no se
 * duplica: se FUSIONA con la existente, con todo lo que tenía (movimientos,
 * deudas, presupuestos, reglas). Dos "General" en el mismo grupo no significan
 * nada distinto y partirían los reportes en dos.
 *
 * Los grupos de sistema (sin espacio) no se borran: son de todos.
 */
CREATE OR REPLACE FUNCTION public.borrar_grupo(grupo uuid, reemplazo uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_grupo     public.category_groups%ROWTYPE;
    v_dest      public.category_groups%ROWTYPE;
    v_cat       public.categories%ROWTYPE;
    v_gemela    uuid;
    v_movidas   integer := 0;
    v_fusionadas integer := 0;
    v_cuantas   integer;
BEGIN
    SELECT * INTO v_grupo FROM public.category_groups WHERE id = grupo AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Macrogrupo no encontrado';
    END IF;
    IF v_grupo.workspace_id IS NULL OR v_grupo.is_system THEN
        RAISE EXCEPTION 'El macrogrupo "%" es del sistema y no se puede borrar', v_grupo.name;
    END IF;
    IF NOT public.can_see_all(v_grupo.workspace_id) THEN
        RAISE EXCEPTION 'No tenés acceso para administrar las categorías de este espacio';
    END IF;

    SELECT count(*) INTO v_cuantas FROM public.categories WHERE group_id = grupo AND deleted_at IS NULL;

    IF v_cuantas > 0 THEN
        IF reemplazo IS NULL THEN
            RAISE EXCEPTION 'El macrogrupo "%" tiene % categoría(s): elegí a qué grupo pasarlas', v_grupo.name, v_cuantas;
        END IF;

        SELECT * INTO v_dest FROM public.category_groups WHERE id = reemplazo AND deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El macrogrupo de reemplazo no existe';
        END IF;
        IF v_dest.id = v_grupo.id THEN
            RAISE EXCEPTION 'Un macrogrupo no se puede reemplazar por sí mismo';
        END IF;
        IF v_dest.workspace_id IS NOT NULL AND v_dest.workspace_id <> v_grupo.workspace_id THEN
            RAISE EXCEPTION 'El macrogrupo de reemplazo es de otro espacio';
        END IF;

        FOR v_cat IN
            SELECT * FROM public.categories WHERE group_id = grupo AND deleted_at IS NULL
        LOOP
            SELECT d.id INTO v_gemela
              FROM public.categories d
             WHERE d.group_id = reemplazo
               AND d.deleted_at IS NULL
               AND d.workspace_id = v_cat.workspace_id
               AND d.type = v_cat.type
               AND lower(btrim(d.name)) = lower(btrim(v_cat.name))
             LIMIT 1;

            IF v_gemela IS NOT NULL THEN
                PERFORM public.borrar_categoria(v_cat.id, v_gemela);
                v_fusionadas := v_fusionadas + 1;
            ELSE
                UPDATE public.categories SET group_id = reemplazo WHERE id = v_cat.id;
                v_movidas := v_movidas + 1;
            END IF;
        END LOOP;
    END IF;

    UPDATE public.category_groups SET deleted_at = now() WHERE id = grupo;

    RETURN jsonb_build_object('movidas', v_movidas, 'fusionadas', v_fusionadas);
END;
$$;

REVOKE ALL ON FUNCTION public.uso_de_categoria(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.borrar_categoria(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.uso_de_grupo(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.borrar_grupo(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.uso_de_categoria(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_categoria(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.uso_de_grupo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_grupo(uuid, uuid) TO authenticated;
