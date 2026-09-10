-- 033 · Los movimientos importados de Samurai quedan a nombre de quien los hizo
--
-- Los 1062 movimientos de Samurai figuraban con Matías como autor, pero eso es
-- un artefacto de la importación: los cargó él desde la planilla, no los hizo
-- él. El que lleva la operación del restaurante es Ariel.
--
-- Alcance, acotado a propósito:
--   · Sólo Samurai. Los 1504 de "Principal" son las finanzas personales de
--     Matías y esos sí son suyos.
--   · Sólo los que hoy figuran a nombre de Matías. El movimiento que cargó Joel
--     desde la app es genuinamente suyo y no se toca.
--
-- El disparador del historial se apaga durante la operación: esto no es una
-- acción de un usuario sino una corrección de la importación, y dejarlo
-- prendido generaría 1062 entradas de "Editó movimiento" que taparían el
-- historial real.

BEGIN;

ALTER TABLE public.transactions DISABLE TRIGGER log_activity_transactions;

UPDATE public.transactions
   SET user_id = (SELECT id FROM public.users WHERE email = 'ariel.hosid@gmail.com')
 WHERE workspace_id = '06a79300-cec3-49b1-841b-de5a032754f5'
   AND user_id = (SELECT id FROM public.users WHERE email = 'matusukanec@gmail.com');

ALTER TABLE public.transactions ENABLE TRIGGER log_activity_transactions;

-- Ya que está: el socio "Ariel" del espacio es esta misma persona.
UPDATE public.partners
   SET user_id = (SELECT id FROM public.users WHERE email = 'ariel.hosid@gmail.com')
 WHERE workspace_id = '06a79300-cec3-49b1-841b-de5a032754f5'
   AND lower(name) = 'ariel'
   AND user_id IS NULL;

COMMIT;
