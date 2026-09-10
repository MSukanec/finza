-- 026 · Tabla de socios y enganche con los movimientos
--
-- Va separada de la 025 porque los valores nuevos del enum no se pueden usar
-- en la misma transacción en la que se agregan.

-- ---------------------------------------------------------------- 1. Socios

CREATE TABLE IF NOT EXISTS public.partners (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

    -- El socio existe aunque todavía no tenga cuenta en la app: en un
    -- restaurante los socios se cargan mucho antes de que cada uno se
    -- registre. Cuando se registra, se vincula acá.
    user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,

    name         text NOT NULL,

    -- Participación en el negocio. Puede quedar en 0 hasta que la definan; la
    -- app avisa cuando la suma del espacio no da 100.
    ownership_pct numeric(6,3) NOT NULL DEFAULT 0
        CONSTRAINT partners_pct_rango CHECK (ownership_pct >= 0 AND ownership_pct <= 100),

    notes        text,
    joined_at    date NOT NULL DEFAULT CURRENT_DATE,

    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);

-- Un socio no puede estar dos veces en el mismo espacio.
CREATE UNIQUE INDEX IF NOT EXISTS partners_espacio_nombre_uniq
    ON public.partners (workspace_id, lower(name))
    WHERE deleted_at IS NULL;

-- Ni una misma persona vinculada dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS partners_espacio_usuario_uniq
    ON public.partners (workspace_id, user_id)
    WHERE user_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS partners_espacio_idx ON public.partners (workspace_id);

DROP TRIGGER IF EXISTS partners_updated_at ON public.partners;
CREATE TRIGGER partners_updated_at
    BEFORE UPDATE ON public.partners
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------- 2. Enganche con movimientos

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_partner_idx
    ON public.transactions (partner_id) WHERE partner_id IS NOT NULL;

-- Un aporte o un retiro sin socio no significa nada: no se sabe de quién es la
-- plata. Al revés también: un gasto no lleva socio.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_socio_coherente;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_socio_coherente CHECK (
    CASE
        WHEN type IN ('contribution', 'withdrawal') THEN partner_id IS NOT NULL
        ELSE partner_id IS NULL
    END
);

-- ---------------------------------------------------------------- 3. RLS

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partners_select ON public.partners;
DROP POLICY IF EXISTS partners_insert ON public.partners;
DROP POLICY IF EXISTS partners_update ON public.partners;
DROP POLICY IF EXISTS partners_delete ON public.partners;

-- Misma regla que el resto de las tablas de datos: quién ve una fila lo define
-- la membresía del espacio, nunca el estado de la fila. Nada de
-- `deleted_at IS NULL` acá: rompería el borrado lógico (ver DB/014).
CREATE POLICY partners_select ON public.partners
    FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

CREATE POLICY partners_insert ON public.partners
    FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY partners_update ON public.partners
    FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

-- Sin política de DELETE: el borrado es lógico.

GRANT SELECT, INSERT, UPDATE ON public.partners TO authenticated;

-- ---------------------------------------------------------- 4. Historial

DROP TRIGGER IF EXISTS partners_activity ON public.partners;
CREATE TRIGGER partners_activity
    AFTER INSERT OR UPDATE OR DELETE ON public.partners
    FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- ------------------------------------------------- 5. Cuenta corriente

/**
 * Situación de cada socio contra el negocio.
 *
 * `saldo` = aportes − retiros. Positivo: el socio puso más de lo que sacó, el
 * negocio le debe. Negativo: se llevó más de lo que puso.
 *
 * `retiros_pct` es el dato que evita discusiones entre socios: qué porcentaje
 * del total retirado se llevó cada uno. Comparado contra su participación se
 * ve de una si alguien retiró de más.
 */
CREATE OR REPLACE FUNCTION public.partner_positions(ws uuid)
RETURNS TABLE (
    id             uuid,
    name           text,
    user_id        uuid,
    ownership_pct  numeric,
    aportes        numeric,
    retiros        numeric,
    saldo          numeric,
    retiros_pct    numeric,
    ultimo_mov     timestamptz
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
    WITH movs AS (
        SELECT t.partner_id,
               COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'contribution'), 0) AS aportes,
               COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'withdrawal'), 0)   AS retiros,
               MAX(t.date) AS ultimo
          FROM public.transactions t
         WHERE t.workspace_id = ws
           AND t.deleted_at IS NULL
           AND t.partner_id IS NOT NULL
         GROUP BY t.partner_id
    ),
    total AS (SELECT NULLIF(SUM(m.retiros), 0) AS retirado FROM movs m)
    SELECT p.id,
           p.name,
           p.user_id,
           p.ownership_pct,
           COALESCE(m.aportes, 0),
           COALESCE(m.retiros, 0),
           COALESCE(m.aportes, 0) - COALESCE(m.retiros, 0),
           ROUND(100 * COALESCE(m.retiros, 0) / total.retirado, 2),
           m.ultimo
      FROM public.partners p
      LEFT JOIN movs m ON m.partner_id = p.id
      CROSS JOIN total
     WHERE p.workspace_id = ws
       AND p.deleted_at IS NULL
     ORDER BY p.ownership_pct DESC, p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_positions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.partner_positions(uuid) TO authenticated;
