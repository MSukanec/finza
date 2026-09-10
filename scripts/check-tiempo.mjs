// El formato de "última conexión": lo que se lee en la pantalla de miembros.
const { haceCuanto, esDeHoy } = await import('../src/lib/tiempo.ts');

const min = (n) => new Date(Date.now() - n * 60000).toISOString();

const casos = [
  ['nunca entró', haceCuanto(null), 'nunca entró'],
  ['recién', haceCuanto(min(0.5)), 'recién'],
  ['minutos', haceCuanto(min(20)), 'hace 20 min'],
  ['horas', haceCuanto(min(60 * 5)), 'hace 5 h'],
  ['ayer', haceCuanto(min(60 * 30)), 'ayer'],
  ['días', haceCuanto(min(60 * 24 * 6)), 'hace 6 días'],
  ['más de un mes cae en fecha', haceCuanto(min(60 * 24 * 200)).includes('hace'), false],
  ['esDeHoy con algo reciente', esDeHoy(min(60)), true],
  ['esDeHoy con algo viejo', esDeHoy(min(60 * 48)), false],
  ['esDeHoy con null', esDeHoy(null), false],
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
