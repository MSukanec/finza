// Quién puede cambiar un movimiento (src/lib/autoria.ts). Ver DB/050.
//
// Regla: si lo ves, lo podés corregir. El administrador y los miembros ven todo
// el espacio; el colaborador sólo lo que cargó él, así que queda encerrado en lo
// suyo sin que haya que prohibirle nada aparte.
//
// Antes (DB/045) cambiar era sólo de quien lo cargó, y se dio vuelta a pedido
// del usuario: entre socios, el que ve un gasto mal cargado tiene que poder
// corregirlo. Lo que ordena eso no es la prohibición, es que Actividad diga
// quién lo cambió y de quién era.
const { puedeCambiar } = await import('../src/lib/autoria.ts');

const mio = { user_id: 'yo' };
const deAriel = { user_id: 'ariel' };

const casos = [
  ['el dueño corrige lo de otro', puedeCambiar(deAriel, 'yo', 'owner') === true],
  ['un socio corrige lo de otro', puedeCambiar(deAriel, 'yo', 'member') === true],
  ['la encargada corrige lo suyo', puedeCambiar(mio, 'yo', 'collaborator') === true],
  ['la encargada NO toca lo de otro', puedeCambiar(deAriel, 'yo', 'collaborator') === false],
  ['sin rol conocido, sólo lo propio', puedeCambiar(mio, 'yo', null) === true],
  ['sin rol conocido, lo ajeno no', puedeCambiar(deAriel, 'yo', null) === false],
  ['sin sesión, nada', puedeCambiar(mio, null, 'collaborator') === false],
  ['sin movimiento, nada', puedeCambiar(undefined, 'yo', 'owner') === false],
  // Un movimiento sin autor (importado antes de que se guardara quién cargaba)
  // lo puede corregir quien ve todo, pero no la encargada.
  ['un movimiento sin autor lo corrige un socio', puedeCambiar({ user_id: null }, 'yo', 'member') === true],
  ['y la encargada no', puedeCambiar({ user_id: null }, 'yo', 'collaborator') === false],
];

let fallas = 0;
for (const [nombre, ok] of casos) {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}`);
  if (!ok) fallas++;
}
process.exit(fallas ? 1 : 0);
