-- 036 · Las fechas que quedaron sólo en el texto, y un campo para la referencia
--
-- ============================ PARTE 1: fechas =============================
--
-- La 035 separó devengado de percibido usando `invoiced_at`. Quedaron afuera
-- los movimientos donde el socio puso la fecha del PAGO en las dos columnas y
-- la del pedido sólo en la descripción. Son 11 y se corrigen uno por uno: son
-- pocos, la plata es real, y una expresión regular sobre texto libre es peor
-- que leerlos.
--
-- Criterio para los que juntan varios pedidos en un pago: se toma el ÚLTIMO
-- pedido. Es la fecha más tardía posible, así que nunca se adelanta un gasto a
-- un mes anterior al que le corresponde. Todos los pedidos de cada grupo caen
-- en el mismo mes salvo el último caso, que está marcado.

BEGIN;

ALTER TABLE public.transactions DISABLE TRIGGER log_activity_transactions;

-- "Saiz Caputo - Descartables. Pedido del 24-2-2026 y pagado con cheque el 2-3-2026"
UPDATE public.transactions SET date = '2026-02-24 12:00:00-03', settles_at = date
 WHERE description LIKE 'Saiz Caputo%Pedido del 24-2-2026 y pagado con cheque el 2-3-2026%'
   AND settles_at IS NULL;

-- "Pedidos del 10, 14 y 17 Feb. Pagado con cheques el 16 y 20 Mar." (x2)
UPDATE public.transactions SET date = '2026-02-17 12:00:00-03', settles_at = date
 WHERE description LIKE 'Pedidos del 10, 14 y 17 Feb.%' AND settles_at IS NULL;

-- "Pedidos del 21, 25 y 28 Feb. Pagado con cheques entre el 6 y 10 Abril." (x2)
UPDATE public.transactions SET date = '2026-02-28 12:00:00-03', settles_at = date
 WHERE description LIKE 'Pedidos del 21, 25 y 28 Feb.%' AND settles_at IS NULL;

-- "Pedidos del 4, 7, 10, 14 y 17 Marzo. Pagado con cheques entre el 17 Abril y 4 Mayo." (x2)
UPDATE public.transactions SET date = '2026-03-17 12:00:00-03', settles_at = date
 WHERE description LIKE 'Pedidos del 4, 7, 10, 14 y 17 Marzo.%' AND settles_at IS NULL;

-- "Pedido del 21 Marzo. Pagado con cheque el 8 Mayo." (x2)
UPDATE public.transactions SET date = '2026-03-21 12:00:00-03', settles_at = date
 WHERE description LIKE 'Pedido del 21 Marzo.%' AND settles_at IS NULL;

-- "Servilletas - Elisam SRL - Pedido el 1-6-2026 y pagado con cheque el 8-6-2026"
UPDATE public.transactions SET date = '2026-06-01 12:00:00-03', settles_at = date
 WHERE description LIKE 'Servilletas - Elisam SRL - Pedido el 1-6-2026%' AND settles_at IS NULL;

-- "Saiz Caputo - Descartables. Pedidos del 22-6-2026 y 13-4-2026 (x2) y pagado con transferencia"
-- El único que junta pedidos de meses distintos (abril y junio). Se toma junio,
-- el más tardío: parte de este gasto en rigor es de abril.
UPDATE public.transactions SET date = '2026-06-22 12:00:00-03', settles_at = date
 WHERE description LIKE 'Saiz Caputo%Pedidos del 22-6-2026 y 13-4-2026%' AND settles_at IS NULL;

ALTER TABLE public.transactions ENABLE TRIGGER log_activity_transactions;

-- ========================== PARTE 2: referencia ===========================
--
-- El número de factura vivía dentro de la descripción porque en una planilla no
-- había otro lugar. Con un campo propio se puede buscar por comprobante, que es
-- como se rastrea un pago cuando el proveedor reclama.

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS reference text;

COMMENT ON COLUMN public.transactions.reference IS
    'Número de comprobante: factura, remito, ticket. Se busca por acá.';

CREATE INDEX IF NOT EXISTS transactions_reference_idx
    ON public.transactions (workspace_id, reference)
    WHERE reference IS NOT NULL AND deleted_at IS NULL;

COMMIT;

-- ---------------------------------------------------------------- Backfill

-- El número sale de la descripción y pasa a su campo. El texto queda sin ese
-- fragmento, que era ruido dentro de la frase, y se le sacan los separadores
-- que quedan sueltos al quitarlo.
BEGIN;
ALTER TABLE public.transactions DISABLE TRIGGER log_activity_transactions;

UPDATE public.transactions
   SET reference = substring(description from '(\mFC\s*[0-9A-Za-z][0-9A-Za-z-]*)'),
       description = NULLIF(
           btrim(
               regexp_replace(
                   regexp_replace(description, '\s*-?\s*\mFC\s*[0-9A-Za-z][0-9A-Za-z-]*\s*-?\s*', ' - ', 'i'),
                   '\s*-\s*-\s*', ' - ', 'g'
               ),
               ' -.'
           ), '')
 WHERE workspace_id = '06a79300-cec3-49b1-841b-de5a032754f5'
   AND deleted_at IS NULL
   AND reference IS NULL
   AND description ~* '\mFC\s*[0-9]';

-- El ticket Z es el comprobante fiscal del cierre de caja: mismo rol.
UPDATE public.transactions
   SET reference = 'Ticket Z'
 WHERE workspace_id = '06a79300-cec3-49b1-841b-de5a032754f5'
   AND deleted_at IS NULL
   AND reference IS NULL
   AND description ~* '\mticket\s*z\M';

ALTER TABLE public.transactions ENABLE TRIGGER log_activity_transactions;
COMMIT;
