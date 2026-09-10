-- 025 · Socios, aportes y retiros
--
-- Un aporte NO es un ingreso y un retiro NO es un egreso.
--
-- El estado de resultados mide qué generó y qué consumió el negocio: ventas
-- contra costos. Un aporte es plata que pone un socio de su bolsillo, y un
-- retiro es plata que se lleva. Ninguno de los dos dice nada sobre si el
-- negocio funcionó: son movimientos del PATRIMONIO.
--
-- Los dos mueven la caja, eso sí. Por eso el saldo de la billetera los tiene
-- que contar, y el resultado del mes NO. Esa diferencia es la que explica que
-- un restaurante pueda tener la caja llena y estar perdiendo plata.
--
-- Estado previo (auditado): en Samurai había un grupo "Aportes" con una
-- categoría por socio y 8 movimientos por $1.334.486, todos cargados como
-- ingreso. En enero de 2026 inflaban los ingresos del mes un 5,1%.

-- ---------------------------------------------------------------- 1. Tipos

-- ADD VALUE no puede usarse dentro de la misma transacción que lo crea, así
-- que estos dos statements van sueltos y el resto de la migración después.
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'contribution';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'withdrawal';
