// Prueba el motor de importación (src/lib/import) contra los casos que ya
// rompieron una vez. Cada caso de acá corresponde a un dato malo que llegó a la
// base, no a una hipótesis.
//
//   node --experimental-loader ./scripts/tsx-loader.mjs scripts/check-import.mjs
//   npm run check:import
import {
  buscarRegla,
  emparejar,
  esResumenVisa,
  leerPdf,
  leerResumenVisa,
  resumenAMovimientos,
  separarComercio,
  emparejarTransferencias,
  huella,
  interpretar,
  leerFecha,
  leerMonto,
  leerPlanilla,
  leerTipo,
} from '../src/lib/import/index.ts';

let fallas = 0;

function ok(nombre, condicion, detalle = '') {
  if (condicion) {
    console.log(`OK    ${nombre}`);
  } else {
    fallas++;
    console.log(`FALLA ${nombre}${detalle ? ` -> ${detalle}` : ''}`);
  }
}

const csv = (texto) => new TextEncoder().encode(texto);

// ---------------------------------------------------------------- valores

ok('monto argentino con punto de miles', leerMonto('1.026.317') === 1026317);
ok('monto con decimales', leerMonto('1.234,56') === 1234.56);
ok('un guion suelto es "sin monto", no un cero', leerMonto(' - ') === null);
ok('celda vacía es "sin monto"', leerMonto('') === null);

ok('fecha argentina, día primero', leerFecha('11-12-2025').slice(0, 10) === '2025-12-11');
// Con `new Date(y, m, d)` en horario local, una fecha del sur cae en el día
// anterior al pasarla a ISO y toda la importación queda corrida.
ok('la fecha no se corre de día', leerFecha('1-12-2025').slice(0, 10) === '2025-12-01');
ok('fecha imposible se rechaza', leerFecha('31-02-2025') === null);

ok('Egreso es gasto', leerTipo('Egreso') === 'expense');
ok('Ingreso es ingreso', leerTipo('ingreso') === 'income');

// ---------------------------------------------------------------- matcheo

// El importador viejo daba por bueno cualquier par que compartiera los primeros
// 4 caracteres, así que categorizaba "Comidas" como "Comisiones" en silencio.
const cats = [{ name: 'Comisiones' }, { name: 'Bebidas' }, { name: 'Artículos de Limpieza' }];
ok(
  '"Comidas" NO matchea con "Comisiones"',
  emparejar('Comidas', cats, (c) => c.name) === null,
  JSON.stringify(emparejar('Comidas', cats, (c) => c.name))
);
ok(
  'el acento no impide el match',
  emparejar('Articulos de limpieza', cats, (c) => c.name)?.item.name === 'Artículos de Limpieza'
);
ok(
  'una letra de más sigue matcheando',
  emparejar('Comisionés', cats, (c) => c.name)?.item.name === 'Comisiones'
);
ok('idénticos dan confianza exacta', emparejar('bebidas', cats, (c) => c.name)?.confianza === 'exacta');

// ---------------------------------------------------------------- planilla

// Encabezados reales del Excel: la columna es "FECHA PERC.", no "FECHA". El
// importador viejo no la reconocía y fechaba cada fila con el día de la carga.
const planilla = leerPlanilla(
  csv(
    'Movimientos del mes;;;;;;;;\r' +
      'FECHA PERC.;FECHA DEV.;TIPO;CATEGORIA;SUBCATEGORIA;DETALLE;FIAT;BILLETERA; TOTAL \r' +
      '11-11-2025;11-11-2025;Egreso;Bebidas;Bebidas alcoholicas;Vinos;Pesos;Efectivo; 566.479   \r' +
      '12-11-2025;;Egreso;Comidas;Salmon;"Fresco Pez\nsegunda linea";Pesos;Mercado Pago; 449.150   \r' +
      '13-11-2025;;Egreso;Varios;;Sin monto;Pesos;Efectivo; -   \r'
  )
);
ok('encuentra la fila de encabezados aunque haya un título arriba', planilla.filaEncabezado === 1);
ok('reconoce FECHA PERC. como la fecha', planilla.columnas.fecha === 0);
ok('reconoce FECHA DEV. como el facturado', planilla.columnas.fechaFacturado === 1);

const { movimientos, descartadas } = interpretar(planilla);
ok('lee las filas de datos', movimientos.length === 2, `salieron ${movimientos.length}`);
ok('la fecha sale de la planilla, no de hoy', movimientos[0].fecha.slice(0, 10) === '2025-11-11');
ok('CATEGORIA es el grupo y SUBCATEGORIA la categoría', movimientos[0].grupo === 'Bebidas' && movimientos[0].categoria === 'Bebidas alcoholicas');
// Así está cargado en la base: "Delivery + Takeaway › General", no al revés.
const sinSub = interpretar(leerPlanilla(csv('FECHA;TIPO;CATEGORIA;TOTAL\r1-1-2025;Egreso;Nafta;1.000\r'))).movimientos[0];
ok('sin SUBCATEGORIA la categoría es General dentro del grupo', sinSub.grupo === 'Nafta' && sinSub.categoria === 'General');
ok('el salto de línea dentro de una celda no corta la fila', movimientos[1].detalle === 'Fresco Pez segunda linea');
ok('la fila sin monto se descarta, no se carga en cero', descartadas.length === 1 && descartadas[0].motivo === 'sinMonto');

// El archivo viene de Excel para Mac: si se decodifica como UTF-8, ninguna
// categoría acentuada matchea y el importador ofrece crear duplicados.
const macRoman = new Uint8Array([
  ...csv('FECHA;TIPO;CATEGORIA;TOTAL\r1-1-2025;Egreso;Salm'),
  0x97, // "ó" en Mac Roman
  ...csv('n;1.000\r'),
]);
ok('detecta Mac Roman', leerPlanilla(macRoman).codificacion === 'macintosh');
ok('y los acentos llegan enteros', interpretar(leerPlanilla(macRoman)).movimientos[0].grupo === 'Salmón');

// ---------------------------------------------------------------- transferencias

// El emparejador viejo comparaba la fecha como texto y toleraba montos que
// difirieran hasta en 2, sin mirar la billetera: de 145 filas armó 21 pares y
// dejó 103 huérfanas en la base.
const pases = interpretar(
  leerPlanilla(
    csv(
      'FECHA;TIPO;CATEGORIA;DETALLE;BILLETERA;TOTAL\r' +
        '1-1-2025;Egreso;MOVIMIENTOS;Saco;Efectivo;10.000\r' +
        '1-1-2025;Ingreso;MOVIMIENTOS;Pongo;Mercado Pago;10.000\r' +
        '3-1-2025;Egreso;MOVIMIENTOS;Sale viernes;Efectivo;5.000\r' +
        '5-1-2025;Ingreso;MOVIMIENTOS;Entra lunes;Banco;5.000\r' +
        '9-1-2025;Egreso;MOVIMIENTOS;Sin pareja;Efectivo;7.000\r'
    )
  )
).movimientos;

const { pares, huerfanos } = emparejarTransferencias(pases);
ok('empareja el pase del mismo día', pares.some((p) => p.desfase === 0));
ok('empareja el pase con desfase de días', pares.some((p) => p.desfase === 2));
ok('deja huérfano lo que no tiene pareja', huerfanos.length === 1 && huerfanos[0].detalle === 'Sin pareja');

// Dos patas en la misma billetera no son una transferencia.
const mismaBilletera = interpretar(
  leerPlanilla(
    csv(
      'FECHA;TIPO;CATEGORIA;DETALLE;BILLETERA;TOTAL\r' +
        '1-1-2025;Egreso;MOVIMIENTOS;Sale;Efectivo;10.000\r' +
        '1-1-2025;Ingreso;MOVIMIENTOS;Entra;Efectivo;10.000\r'
    )
  )
).movimientos;
ok('no empareja dos patas de la misma billetera', emparejarTransferencias(mismaBilletera).pares.length === 0);

// ---------------------------------------------------------------- reglas

const fila = (extra = {}) => ({
  linea: 1, fecha: '2025-01-01T12:00:00.000Z', fechaFacturado: null, tipo: 'expense',
  grupo: 'Comidas', categoria: 'Salmón', detalle: 'UBER *TRIP 4821', moneda: 'ARS',
  billetera: 'Efectivo', monto: 1000, esTransferencia: false, ...extra,
});
const regla = (r) => ({
  id: r.id ?? 'r', field: r.field, source: r.source ?? null, matchType: r.matchType ?? 'exact',
  pattern: r.pattern, type: r.type ?? null, categoryId: r.categoryId ?? null,
  walletId: r.walletId ?? null, hits: r.hits ?? 0,
});

ok(
  'una regla exacta sobre grupo|categoria matchea',
  buscarRegla(fila(), [regla({ id: 'a', field: 'categoria', pattern: 'comidas|salmon', categoryId: 'c1' })], 'categoria')?.id === 'a'
);
// "Comidas|Salmón" y "Bebidas|Salmón" no son la misma categoría.
ok(
  'la regla de categoria no cruza de grupo',
  buscarRegla(fila({ grupo: 'Bebidas' }), [regla({ field: 'categoria', pattern: 'comidas|salmon', categoryId: 'c1' })], 'categoria') === null
);
// El detalle de un resumen nunca se repite igual: "UBER *TRIP 4821".
ok(
  'una regla contains matchea adentro del detalle',
  buscarRegla(fila(), [regla({ id: 'b', field: 'detalle', matchType: 'contains', pattern: 'uber', categoryId: 'c1' })], 'detalle')?.id === 'b'
);
ok(
  'entre dos contains gana el patron mas largo',
  buscarRegla(
    fila({ detalle: 'UBER EATS PEDIDO 12' }),
    [
      regla({ id: 'corta', field: 'detalle', matchType: 'contains', pattern: 'uber', categoryId: 'c1' }),
      regla({ id: 'larga', field: 'detalle', matchType: 'contains', pattern: 'uber eats', categoryId: 'c2' }),
    ],
    'detalle'
  )?.id === 'larga'
);
ok(
  'exact le gana a contains',
  buscarRegla(
    fila({ detalle: 'uber' }),
    [
      regla({ id: 'cont', field: 'detalle', matchType: 'contains', pattern: 'uber', categoryId: 'c1' }),
      regla({ id: 'exac', field: 'detalle', matchType: 'exact', pattern: 'uber', categoryId: 'c2' }),
    ],
    'detalle'
  )?.id === 'exac'
);
// "Cuota" significa una cosa en el resumen de la tarjeta y otra en la planilla.
ok(
  'una regla con origen le gana a la general',
  buscarRegla(
    fila(),
    [
      regla({ id: 'gral', field: 'detalle', matchType: 'contains', pattern: 'uber', categoryId: 'c1' }),
      regla({ id: 'visa', field: 'detalle', source: 'visa', matchType: 'contains', pattern: 'uber', categoryId: 'c2' }),
    ],
    'detalle',
    'visa'
  )?.id === 'visa'
);
ok(
  'una regla de otro origen no se aplica',
  buscarRegla(fila(), [regla({ field: 'detalle', source: 'visa', matchType: 'contains', pattern: 'uber', categoryId: 'c1' })], 'detalle', 'planilla') === null
);
ok(
  'una regla atada a ingreso no toca un gasto',
  buscarRegla(fila(), [regla({ field: 'categoria', pattern: 'comidas|salmon', type: 'income', categoryId: 'c1' })], 'categoria') === null
);

// ---------------------------------------------------------------- huella

// La huella es espejo de `transaction_fingerprint` en la base; que las dos den
// lo mismo contra filas reales lo verifica `npm run check:huellas`.
const base = { fecha: '2025-01-01T12:00:00.000Z', monto: 1000, walletId: 'w1', detalle: 'Pago', tipo: 'expense' };
ok('la misma fila da la misma huella', huella(base) === huella({ ...base, detalle: ' PAGO ' }));
ok('cambiar el monto cambia la huella', huella(base) !== huella({ ...base, monto: 1001 }));
ok('cambiar la hora del día no cambia la huella', huella(base) === huella({ ...base, fecha: '2025-01-01T23:00:00.000Z' }));
ok('el signo no cambia la huella', huella(base) === huella({ ...base, monto: -1000 }));
ok('otra billetera es otro movimiento', huella(base) !== huella({ ...base, walletId: 'w2' }));

// ---------------------------------------------------------------- archivo real

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const muestra = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples', 'Samurai.csv');
if (fs.existsSync(muestra)) {
  const real = leerPlanilla(fs.readFileSync(muestra));
  const { movimientos: reales } = interpretar(real);
  ok('el CSV real se lee como Mac Roman', real.codificacion === 'macintosh');
  ok('el CSV real entrega más de mil movimientos', reales.length > 1000, `salieron ${reales.length}`);
  ok(
    'las categorías acentuadas del CSV real llegan enteras',
    reales.some((m) => m.categoria === 'Salmón' || m.grupo === 'Salmón'),
  );
}

// ---------------------------------------------------------------- resumen visa

// El campo del comercio mide 17 cuando ademas hay referencia, pero el nombre
// corre hasta 25 cuando no la hay. Cortar de mas deja una regla que no vuelve a
// matchear nunca.
ok('separa el comercio de la referencia con hueco', separarComercio('ANTHROPIC        in1Tz3coB') === 'ANTHROPIC');
ok('separa cuando la referencia arranca en la 17', separarComercio('AUTOPISTA DEL OE 960003232276701') === 'AUTOPISTA DEL OE');
ok('no corta un nombre largo sin referencia', separarComercio('SUPERMERCADO EL ABASTECED') === 'SUPERMERCADO EL ABASTECED');
ok('separa la referencia pegada sin espacio', separarComercio('CIA SEG LA MER0000516260369-005-010') === 'CIA SEG LA MER');
ok('no confunde digitos del nombre con una referencia', separarComercio('YPF 3125 PLAYA') === 'YPF 3125 PLAYA');

const resumenPdf = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples', 'VISA - Resumen.pdf');
if (fs.existsSync(resumenPdf)) {
  const paginas = await leerPdf(fs.readFileSync(resumenPdf));
  ok('el PDF real se abre y tiene texto', paginas.length === 6, `salieron ${paginas.length} paginas`);
  ok('los acentos del PDF llegan enteros',
    paginas.some((p) => p.fragmentos.some((f) => f.texto.includes('DOLARES'.replace('O', 'Ó')))));
  ok('reconoce que es un resumen Visa', esResumenVisa(paginas) === true);

  const r = leerResumenVisa(paginas);
  ok('lee las 53 filas del resumen', r.filas.length === 53, `salieron ${r.filas.length}`);
  ok('encuentra las tres tarjetas', r.tarjetas.length === 3);

  // La prueba mas fuerte del parseo: la aritmetica del resumen tiene que cerrar.
  // saldo anterior + movimientos del periodo - pago = total a pagar.
  const SALDO_ANTERIOR = 2957104.46;
  const delPeriodo = r.filas
    .filter((f) => f.moneda === 'ARS' && f.clase !== 'saldo')
    .reduce((a, f) => a + f.monto * f.signo, 0);
  ok('la aritmetica del resumen cierra contra el total impreso',
    Math.abs(SALDO_ANTERIOR + delPeriodo - r.totalArs) < 0.01,
    `${(SALDO_ANTERIOR + delPeriodo).toFixed(2)} vs ${r.totalArs}`);

  const usd = r.filas.filter((f) => f.moneda === 'USD' && f.clase === 'consumo')
    .reduce((a, f) => a + f.monto * f.signo, 0);
  ok('el total en dolares coincide con el impreso', Math.abs(usd - r.totalUsd) < 0.01, `${usd} vs ${r.totalUsd}`);

  const { movimientos: movs, pagos } = resumenAMovimientos(r, 'Visa');
  ok('el pago del resumen no entra como movimiento', pagos.length === 2 && !movs.some((m) => m.detalle.includes('SU PAGO')));
  ok('la devolucion entra como ingreso', movs.some((m) => m.tipo === 'income' && m.comercio === 'OSDE'));
  ok('las dos monedas salen separadas', new Set(movs.map((m) => m.moneda)).size === 2);
  ok('la cuota queda visible en el detalle', movs.some((m) => m.detalle.includes('cuota 04/12')));

  // OSDE facturado dos veces el mismo dia, por el mismo importe: son DOS gastos
  // reales, no una fila repetida. Si la deduplicacion mira presencia en vez de
  // cantidad, se come 443.055 pesos en silencio.
  const osde = movs.filter((m) => m.comercio === 'OSDE' && m.tipo === 'expense');
  ok('los dos cargos identicos de OSDE sobreviven', osde.length === 2, `quedaron ${osde.length}`);
  const h = (m) => huella({ fecha: m.fecha, monto: m.monto, walletId: 'w', tipo: 'expense', detalle: m.detalle });
  ok('y comparten huella, por eso hay que contar y no preguntar', h(osde[0]) === h(osde[1]));
}

console.log(fallas === 0 ? '\nTodo bien.' : `\n${fallas} falla(s).`);
process.exit(fallas === 0 ? 0 : 1);
