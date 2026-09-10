-- 028_marcar_huerfanos.sql
-- ============================================================
-- Arreglo de DATOS, no de esquema.
--
-- La importación de abril al espacio Principal dejó 103 filas con la
-- descripción "Movimiento huérfano": la planilla las marcaba como MOVIMIENTOS
-- (pases entre billeteras propias) pero ninguna tenía contrapata en el archivo.
-- Probando todas las combinaciones de monto, fecha y billetera —incluso
-- ignorando el TIPO— sólo se arma 1 par, así que no son transferencias
-- despareadas: son movimientos de una sola pata.
--
-- Los SALDOS de billetera están bien: cada fila mueve su billetera igual que lo
-- haría la pata de una transferencia. Lo que está mal es la CLASIFICACIÓN: 58 de
-- esas filas suman 25,3M como ingreso dentro de un espacio con 69,1M de ingresos
-- totales, y las otras 43 pesan sobre los egresos. Ver `afectaResultado` en
-- src/lib/money.ts: income y expense entran al resultado, transfer no.
--
-- Decidir qué era cada una necesita la planilla original, así que este script NO
-- las reclasifica: las marca con status 'warning' para que aparezcan señaladas
-- en Movimientos y se resuelvan a mano. No cambia montos, tipos ni categorías.
--
-- Es idempotente y reversible:
--   update public.transactions set status = 'draft'
--    where description = 'Movimiento huérfano' and status = 'warning';
--
-- El importador nuevo ya no produce estas filas sin rastro: un pase sin pareja
-- entra directamente con status 'warning' y conserva su detalle original.
-- ============================================================

-- El trigger de actividad registra una entrada por fila actualizada. Esto es
-- mantenimiento corriendo como `postgres`, no una acción de una persona:
-- `current_user_id()` daría NULL y el historial del espacio quedaría con 103
-- entradas de autor desconocido.
ALTER TABLE public.transactions DISABLE TRIGGER log_activity_transactions;

UPDATE public.transactions
   SET status = 'warning'
 WHERE description = 'Movimiento huérfano'
   AND deleted_at IS NULL
   AND status <> 'warning';

ALTER TABLE public.transactions ENABLE TRIGGER log_activity_transactions;
