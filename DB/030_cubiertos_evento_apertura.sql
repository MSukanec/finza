-- 030 · Los cubiertos del evento de apertura vuelven a ser ingreso
--
-- La 027 pasó a aporte todo lo que estaba en el grupo de categorías «Aportes».
-- Siete de esos ocho movimientos no eran aportes: eran los cubiertos que cada
-- socio pagó por sus invitados en el evento de apertura. Que los haya pagado un
-- socio no cambia lo que son: el restaurante vendió esas comidas. Es plata que
-- entró por vender, no capital que alguien puso en el negocio.
--
-- Cómo se identifican, sin depender de la memoria de nadie:
--
--   · El cubierto valía $50.000. Lo confirman dos números independientes:
--     el ingreso de Eventos del 16-12-2025, día de apertura, son $1.600.000
--     = 32 cubiertos exactos; y estos siete suman $1.150.000 = 23 cubiertos
--     exactos.
--   · Los siete son múltiplos exactos de 50.000 y cayeron todos el mismo día,
--     el 06-01-2026, cuando los socios saldaron lo de sus invitados.
--
-- El octavo movimiento de ese día NO entra: son $184.486 de Matías con el
-- detalle «Compra cocas». No es múltiplo de 50.000 y no es un cubierto: es
-- plata que Matías puso para una compra del negocio. Ese sigue siendo aporte.
--
-- Quién pagó queda escrito en el detalle. Como ingreso del negocio es un dato
-- anecdótico, pero perderlo sería borrar el porqué de un movimiento de más de
-- un millón de pesos.

BEGIN;

-- Todo en un solo UPDATE: el CHECK de coherencia se evalúa por fila, así que
-- si el tipo pasa a 'income' mientras partner_id sigue puesto, la fila queda
-- inconsistente y la base la rechaza. Bien rechazada.
UPDATE public.transactions t
   SET type        = 'income',
       partner_id  = NULL,
       category_id = (
           SELECT c.id FROM public.categories c
            WHERE c.workspace_id = t.workspace_id
              AND c.group_name = 'Eventos'
              AND c.type = 'income'
              AND c.deleted_at IS NULL
            LIMIT 1
       ),
       description = COALESCE(NULLIF(t.description, ''), '') ||
           CASE WHEN COALESCE(t.description, '') = '' THEN '' ELSE ' — ' END ||
           'Cubiertos del evento de apertura pagados por ' || p.name
  FROM public.partners p
 WHERE p.id = t.partner_id
   AND t.type = 'contribution'
   AND t.deleted_at IS NULL
   AND t.date::date = DATE '2026-01-06'
   -- El corte real: sólo los múltiplos exactos del cubierto.
   AND t.amount > 0
   AND MOD(t.amount::numeric, 50000::numeric) = 0;

COMMIT;
