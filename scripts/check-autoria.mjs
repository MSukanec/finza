// Quién puede cambiar un movimiento (src/lib/autoria.ts). Ver DB/045.
const { puedeCambiar } = await import('../src/lib/autoria.ts');

const casos = [
  ['el autor puede', puedeCambiar({ user_id: 'yo' }, 'yo') === true],
  ['otro no puede, aunque vea el movimiento', puedeCambiar({ user_id: 'ariel' }, 'yo') === false],
  ['sin autor en el movimiento no se ofrece', puedeCambiar({ user_id: null }, 'yo') === false],
  ['sin sesión no se ofrece', puedeCambiar({ user_id: 'yo' }, null) === false],
  ['dos vacíos no cuentan como el mismo', puedeCambiar({ user_id: null }, null) === false],
  ['sin movimiento no se ofrece', puedeCambiar(undefined, 'yo') === false],
];

let fallas = 0;
for (const [nombre, ok] of casos) {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}`);
  if (!ok) fallas++;
}
process.exit(fallas ? 1 : 0);
