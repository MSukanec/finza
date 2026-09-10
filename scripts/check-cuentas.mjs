// El arbol de billeteras: que el mismo peso no se cuente dos veces.
//
// El error de contar padre + hijas no se ve mirando: el numero queda plausible,
// solo que inflado. Aparecio en cuatro pantallas a la vez porque cada una
// recorria la lista por su cuenta.
const { raices, hojas, esAgrupador, saldoTotal } = await import('../src/lib/cuentas.ts');

const cuentas = [
  { id: 'efectivo', name: 'Efectivo', currency_id: 'ars', balance: 26000, parent_id: null },
  { id: 'caja', name: 'Caja registradora', currency_id: 'ars', balance: 25000, parent_id: 'efectivo' },
  { id: 'fuerte', name: 'Caja fuerte', currency_id: 'ars', balance: 1000, parent_id: 'efectivo' },
  { id: 'banco', name: 'Banco', currency_id: 'ars', balance: 7000, parent_id: null },
];

const casos = [
  ['raices deja fuera las subcuentas', raices(cuentas).length, 2],
  ['hojas deja fuera el agrupador', hojas(cuentas).length, 3],
  ['el agrupador no es hoja', hojas(cuentas).some((a) => a.id === 'efectivo'), false],
  ['la subcuenta no es raiz', raices(cuentas).some((a) => a.id === 'caja'), false],
  ['esAgrupador reconoce al padre', esAgrupador(cuentas[0], cuentas), true],
  ['esAgrupador no marca una hoja', esAgrupador(cuentas[3], cuentas), false],
  // El caso que fallo en pantalla: 26000 + 7000, NO 26000+25000+1000+7000.
  ['saldoTotal no cuenta dos veces', saldoTotal(cuentas), 33000],
  ['saldoTotal convierte a la moneda base', saldoTotal(cuentas, (m) => m * 2), 66000],
];

let fallas = 0;
for (const [nombre, obtenido, esperado] of casos) {
  if (obtenido === esperado) console.log(`OK   ${nombre} -> ${obtenido}`);
  else {
    fallas++;
    console.log(`FALLA ${nombre}: esperaba ${esperado}, dio ${obtenido}`);
  }
}
process.exit(fallas === 0 ? 0 : 1);
