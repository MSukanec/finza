-- 027 · Migrar los aportes que estaban cargados como ingreso
--
-- Auditoría previa: en Samurai había un grupo de categorías "Aportes" con una
-- categoría por socio (Matias, Ariel, Pablo, Yuliano, Nicolás, Joel, Marcelo) y
-- 8 movimientos por $1.334.486, todos con type='income'. En enero de 2026
-- inflaban los ingresos del mes un 5,1%.
--
-- Acá se crean los socios a partir de esas categorías y los movimientos pasan a
-- ser aportes de verdad. El porcentaje de participación queda en 0: lo carga
-- cada espacio desde la pantalla de Socios, no lo puede adivinar la migración.
--
-- Los montos, fechas, billeteras y autores NO se tocan: es la misma plata, sólo
-- que dejando de contarse como venta.

BEGIN;

-- 1. Un socio por cada categoría del grupo "Aportes".
INSERT INTO public.partners (workspace_id, name, ownership_pct, notes)
SELECT DISTINCT c.workspace_id, c.name, 0,
       'Creado al migrar el grupo de categorías «Aportes».'
  FROM public.categories c
 WHERE c.group_name = 'Aportes'
   AND c.deleted_at IS NULL
   AND c.workspace_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. Los movimientos de esas categorías pasan a ser aportes del socio.
--    Se limpia category_id: un aporte no vive en el plan de categorías, que es
--    para resultados.
UPDATE public.transactions t
   SET type        = 'contribution',
       partner_id  = p.id,
       category_id = NULL
  FROM public.categories c
  JOIN public.partners p
    ON p.workspace_id = c.workspace_id
   AND lower(p.name)  = lower(c.name)
   AND p.deleted_at IS NULL
 WHERE t.category_id = c.id
   AND c.group_name = 'Aportes'
   AND t.deleted_at IS NULL
   AND t.type = 'income';

-- 3. Las categorías quedan de baja lógica: ya no representan nada.
UPDATE public.categories
   SET deleted_at = now()
 WHERE group_name = 'Aportes'
   AND deleted_at IS NULL;

UPDATE public.category_groups
   SET deleted_at = now()
 WHERE name = 'Aportes'
   AND deleted_at IS NULL;

COMMIT;
