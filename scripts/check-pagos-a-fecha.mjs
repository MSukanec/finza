// Cuándo el formulario ofrece "Se paga" (ofreceFechaDePago). Ver DB/046.
//
// Cada caso sale de un reclamo o de los datos: "Se cobra" aparecía en ingresos
// (en la base no hay ni un ingreso con fecha de cobro), y en efectivo el campo
// sólo ocupa lugar. Pero la caja de la Fábrica sí paga a cuenta: no alcanza con
// preguntar si es un banco.
const { ofreceFechaDePago } = await import('../src/lib/money.ts');

const banco = { allows_deferred_payment: true };
const mostrador = { allows_deferred_payment: false };
const fabrica = { allows_deferred_payment: true }; // efectivo, pero a cuenta

const casos = [
  ['egreso desde una billetera con pagos a fecha: sí', ofreceFechaDePago('expense', banco) === true],
  ['egreso en efectivo del mostrador: no', ofreceFechaDePago('expense', mostrador) === false],
  ['egreso desde una caja que paga a cuenta: sí, aunque sea efectivo', ofreceFechaDePago('expense', fabrica) === true],
  ['ingreso, aunque la billetera acepte pagos a fecha: no', ofreceFechaDePago('income', banco) === false],
  ['transferencia: no', ofreceFechaDePago('transfer', banco) === false],
  ['aporte: no', ofreceFechaDePago('contribution', banco) === false],
  ['retiro: no', ofreceFechaDePago('withdrawal', banco) === false],
  ['billetera sin el dato cargado: no', ofreceFechaDePago('expense', {}) === false],
  ['sin billetera elegida: no', ofreceFechaDePago('expense', null) === false],
  // Si se escondiera, guardar cualquier otro cambio borraría la fecha en silencio.
  ['un gasto que ya tiene fecha de pago la sigue mostrando', ofreceFechaDePago('expense', mostrador, '2026-10-01T12:00:00Z') === true],
  ['pero si se cambia a ingreso, no', ofreceFechaDePago('income', mostrador, '2026-10-01T12:00:00Z') === false],
];

let fallas = 0;
for (const [nombre, ok] of casos) {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}`);
  if (!ok) fallas++;
}
process.exit(fallas ? 1 : 0);
