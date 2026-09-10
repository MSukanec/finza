// Prueba el cálculo de saldos: subcuentas que suman al padre, cheques que
// todavía no se cobraron, y aportes que mueven caja aunque no sean resultado.
// El store importa el cliente de Supabase, que exige estas variables al
// cargarse. Acá no se hace ninguna llamada: se prueba una función pura.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon';

const { withBalances } = await import('../src/stores/finance-store.ts');

const HOY = Date.now();
const dias = (n) => new Date(HOY + n * 86400000).toISOString();

const cuentas = [
  { id: 'efectivo', name: 'Efectivo', initial_balance: 0, currency_id: 'ars', balance: 0, color: '', icon: '', type: 'cash', created_at: '' },
  { id: 'reg', name: 'Caja registradora', parent_id: 'efectivo', initial_balance: 1000, currency_id: 'ars', balance: 0, color: '', icon: '', type: 'cash', created_at: '' },
  { id: 'fuerte', name: 'Caja fuerte', parent_id: 'efectivo', initial_balance: 500, currency_id: 'ars', balance: 0, color: '', icon: '', type: 'cash', created_at: '' },
  { id: 'banco', name: 'Banco', initial_balance: 0, currency_id: 'ars', balance: 0, color: '', icon: '', type: 'bank', created_at: '' },
];

const movimientos = [
  { id: '1', account_id: 'reg', amount: 300, type: 'income', date: dias(-5) },
  { id: '2', account_id: 'reg', amount: 100, type: 'expense', date: dias(-4) },
  { id: '3', account_id: 'fuerte', amount: 200, type: 'contribution', date: dias(-3) },
  // Cheque emitido hace 3 días, se cobra en 10: todavía no toca la caja.
  { id: '4', account_id: 'banco', amount: 900, type: 'expense', date: dias(-3), settles_at: dias(10) },
];

const r = withBalances(cuentas, movimientos);
const saldo = (id) => r.find((a) => a.id === id);

const casos = [
  ['Caja registradora: 1000 + 300 - 100', saldo('reg').balance, 1200],
  ['Caja fuerte: 500 + 200 de aporte', saldo('fuerte').balance, 700],
  ['Efectivo es la suma de sus cajas', saldo('efectivo').balance, 1900],
  ['Efectivo queda marcada como agrupador', saldo('efectivo').isGroup, true],
  ['Banco NO descuenta el cheque sin cobrar', saldo('banco').balance, 0],
  ['Banco muestra los 900 comprometidos', saldo('banco').committed, 900],
];

let fallas = 0;
for (const [nombre, obtenido, esperado] of casos) {
  if (obtenido === esperado) {
    console.log(`OK   ${nombre} -> ${obtenido}`);
  } else {
    fallas++;
    console.log(`FALLA ${nombre}: esperaba ${esperado}, dio ${obtenido}`);
  }
}

process.exit(fallas === 0 ? 0 : 1);
