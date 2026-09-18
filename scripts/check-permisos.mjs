/**
 * Ataca la base desde la sesión de un colaborador y verifica que no pueda ver
 * ni tocar lo que no le corresponde.
 *
 *   node scripts/check-permisos.mjs        (o: npm run check:permisos)
 *
 * Por qué existe: el rol colaborador es la única parte de esta app donde una
 * persona real entra a mirar datos que no son suyos si algo está mal. Esconder
 * un menú no protege nada —tiene un token válido y puede consultar la base por
 * fuera de la app—, así que lo único que la protege son las políticas de RLS y
 * las guardias de las funciones. Esto lo comprueba en vez de suponerlo.
 *
 * Cómo: se arma un colaborador de mentira dentro de una transacción, se prueba
 * todo desde su sesión y se hace ROLLBACK. No queda nada en la base.
 */

import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local'), quiet: true });

if (!process.env.DATABASE_URL) {
  console.log('Sin DATABASE_URL: no hay base contra la cual probar. Salteado.');
  process.exit(0);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

let fallas = 0;
const ok = (nombre, cond, detalle = '') => {
  if (cond) console.log(`OK    ${nombre}`);
  else { fallas++; console.log(`FALLA ${nombre}${detalle ? ` -> ${detalle}` : ''}`); }
};

/**
 * Corre una consulta esperando que la base la RECHACE.
 *
 * Va entre savepoints porque en PostgreSQL un error aborta la transacción
 * entera: sin esto, la primera prueba que sale bien impide correr las demás.
 */
let sp = 0;
async function negado(nombre, sql, params = []) {
  const punto = `p${sp++}`;
  await c.query(`savepoint ${punto}`);
  try {
    await c.query(sql, params);
    await c.query(`release savepoint ${punto}`);
    fallas++;
    console.log(`FALLA ${nombre} -> la base lo permitió`);
  } catch (e) {
    await c.query(`rollback to savepoint ${punto}`);
    // Un error de permisos es el resultado correcto. Uno de sintaxis, no.
    const esperado = /no ten[eé]s acceso|solo el (administrador|due[nñ]o)|no sos miembro|no encontrado|permission denied|row-level security|violates/i.test(e.message);
    if (esperado) console.log(`OK    ${nombre}`);
    else { fallas++; console.log(`FALLA ${nombre} -> fallo por otra razón: ${e.message}`); }
  }
}

/** Cuántas filas ve la sesión actual. */
const cuantas = async (sql, params = []) => Number((await c.query(sql, params)).rows[0].n);

const WS = '06a79300-cec3-49b1-841b-de5a032754f5'; // Samurai
const COLAB = 'b1371501-5393-4b7f-b2ef-693a7a1a3352'; // dev@finza.app, que no es miembro

await c.query('begin');

try {
  // ------------------------------------------------------------ preparar
  // El administrador se busca, no se hardcodea: quién es dueño de qué espacio
  // cambia, y una prueba de seguridad atada a un uuid caduca en silencio.
  const { rows: duenios } = await c.query(
    `select user_id from public.workspace_members where workspace_id=$1 and role='owner' limit 1`, [WS]
  );
  if (!duenios.length) throw new Error('El espacio de prueba no tiene administrador');
  const DUENIO = duenios[0].user_id;

  const { rows: auth } = await c.query('select auth_id from public.users where id = $1', [COLAB]);
  await c.query(
    `insert into public.workspace_members (workspace_id, user_id, role) values ($1,$2,'collaborator')
     on conflict (workspace_id, user_id) do update set role = 'collaborator'`,
    [WS, COLAB]
  );

  // Un movimiento suyo y otro ajeno, para distinguir "ve lo propio" de "ve todo".
  const { rows: w } = await c.query('select id from public.wallets where workspace_id=$1 limit 1', [WS]);
  const { rows: mio } = await c.query(
    `insert into public.transactions (user_id, workspace_id, wallet_id, type, amount, currency_code, description, date)
     values ($1,$2,$3,'expense',123.45,'ARS','movimiento del colaborador', now()) returning id`,
    [COLAB, WS, w[0].id]
  );
  const { rows: ajeno } = await c.query(
    'select id from public.transactions where workspace_id=$1 and user_id <> $2 and deleted_at is null limit 1',
    [WS, COLAB]
  );
  if (!ajeno.length) throw new Error('El espacio de prueba no tiene movimientos de otra persona');

  const totalVivos = await cuantas(
    'select count(*) as n from public.transactions where workspace_id=$1 and deleted_at is null', [WS]
  );

  // ------------------------------------------------------------ ser el colaborador
  await c.query('select set_config($1, $2, true)', [
    'request.jwt.claims', JSON.stringify({ sub: auth[0].auth_id }),
  ]);
  await c.query('set local role authenticated');

  console.log('\n--- lo que SÍ tiene que poder ---\n');

  ok('sabe que su rol es colaborador',
    (await c.query('select public.workspace_role($1) as r', [WS])).rows[0].r === 'collaborator');
  ok('la app no lo considera con acceso total',
    (await c.query('select public.can_see_all($1) as v', [WS])).rows[0].v === false);
  ok('ve las categorías, o no podría clasificar nada',
    (await cuantas('select count(*) as n from public.categories where workspace_id=$1', [WS])) > 0);
  ok('ve las billeteras por función, sin saldos',
    (await cuantas('select count(*) as n from public.billeteras_para_cargar($1)', [WS])) > 0);
  ok('ve su propia membresía, que la app necesita para saber su rol',
    (await cuantas('select count(*) as n from public.workspace_members where workspace_id=$1', [WS])) === 1);

  // Toma la billetera por la función, que es la única vía que le queda.
  const { rows: nuevo } = await c.query(
    `insert into public.transactions (user_id, workspace_id, wallet_id, type, amount, currency_code, description, date)
     select public.current_user_id(), $1, id, 'income', 50, 'ARS', 'cargado por el colaborador', now()
       from public.billeteras_para_cargar($1) limit 1 returning id`,
    [WS]
  );
  ok('puede cargar un movimiento propio', nuevo.length === 1);

  const editadas = (await c.query(
    `update public.transactions set description = 'corregido por el colaborador' where id = $1`, [mio[0].id]
  )).rowCount;
  ok('puede corregir un movimiento suyo', editadas === 1);

  // Recordar el último espacio abierto (DB/049) es escribir en la propia fila.
  const recordo = (await c.query(
    'update public.users set last_workspace_id = $1 where id = public.current_user_id()', [WS]
  )).rowCount;
  ok('puede recordar en qué espacio estaba', recordo === 1);

  console.log('\n--- lo que NO tiene que poder ---\n');

  const tocoOtraCuenta = (await c.query(
    'update public.users set last_workspace_id = $1 where id = $2', [WS, DUENIO]
  )).rowCount;
  ok('no puede cambiar en qué espacio arranca otra persona', tocoOtraCuenta === 0, `afectó ${tocoOtraCuenta}`);

  const ve = await cuantas(
    'select count(*) as n from public.transactions where workspace_id=$1 and deleted_at is null', [WS]
  );
  ok('sólo ve sus propios movimientos', ve === 2, `ve ${ve} de ${totalVivos + 1}`);
  ok('no ve los movimientos ajenos', totalVivos > 100 && ve < totalVivos);

  const tocadas = (await c.query(
    `update public.transactions set amount = 1 where id = $1`, [ajeno[0].id]
  )).rowCount;
  ok('no puede editar un movimiento ajeno', tocadas === 0, `afectó ${tocadas} filas`);

  const borradas = (await c.query('delete from public.transactions where id = $1', [ajeno[0].id])).rowCount;
  ok('no puede borrar un movimiento ajeno', borradas === 0, `borró ${borradas} filas`);

  await negado('no puede cargar un movimiento a nombre de otro',
    `insert into public.transactions (user_id, workspace_id, wallet_id, type, amount, currency_code, description, date)
     select $2, $1, id, 'expense', 1, 'ARS', 'suplantacion', now() from public.billeteras_para_cargar($1) limit 1`,
    [WS, DUENIO]);

  await negado('no puede regalarle un movimiento suyo a otro',
    'update public.transactions set user_id = $2 where id = $1', [mio[0].id, DUENIO]);

  for (const [nombre, tabla] of [
    ['billeteras', 'wallets'],
    ['socios', 'partners'],
    ['presupuestos', 'budgets'],
    ['deudas', 'debts'],
    ['arqueos', 'wallet_reconciliations'],
    ['vaciados', 'purges'],
    ['lotes de importación', 'import_batches'],
    ['reglas de importación', 'import_rules'],
  ]) {
    const n = await cuantas(`select count(*) as n from public.${tabla} where workspace_id=$1`, [WS]);
    ok(`no ve ${nombre}`, n === 0, `vio ${n} filas`);
  }

  const propias = await cuantas(
    'select count(*) as n from public.activity_log where workspace_id=$1 and user_id <> public.current_user_id()', [WS]
  );
  ok('no ve el historial de los demás', propias === 0, `vio ${propias} entradas`);

  await negado('no puede crear categorías',
    `insert into public.categories (user_id, workspace_id, name, type, group_name, group_id)
     select public.current_user_id(), $1, 'colada', 'expense', 'General', group_id
       from public.categories where workspace_id=$1 limit 1`, [WS]);

  await negado('no puede consultar el saldo real de una billetera',
    'select public.wallet_expected_balance((select id from public.billeteras_para_cargar($1) limit 1))', [WS]);
  await negado('no puede ver la posición de los socios', 'select * from public.partner_positions($1)', [WS]);
  await negado('no puede ver los cobros pendientes', 'select * from public.pending_settlements($1)', [WS]);
  await negado('no puede listar los miembros', 'select * from public.list_workspace_members($1)', [WS]);
  await negado('no puede listar las personas del espacio', 'select * from public.list_workspace_people($1)', [WS]);
  await negado('no puede listar los autores del historial', 'select * from public.activity_authors($1)', [WS]);
  await negado('no puede registrar un arqueo',
    'select public.record_reconciliation((select id from public.billeteras_para_cargar($1) limit 1), 0)', [WS]);
  await negado('no puede vaciar el espacio', 'select public.vaciar_espacio($1, null)', [WS]);
  await negado('no puede pasar los movimientos de una categoría a otra',
    `select public.transferir_categoria(
       (select id from public.categories where workspace_id=$1 order by id limit 1),
       (select id from public.categories where workspace_id=$1 order by id desc limit 1))`, [WS]);
  await negado('no puede invitar a nadie',
    `select public.invite_to_workspace($1, 'colado@ejemplo.com', 'owner')`, [WS]);
  await negado('no puede clonar el espacio', `select public.clone_workspace($1, 'copia')`, [WS]);
  await negado('no puede aprender reglas de importación',
    `select public.aprender_regla($1, 'detalle', 'x', null, 'expense', null, null, 'contains')`, [WS]);
  // Este no lanza error: la política de UPDATE simplemente no deja que ninguna
  // fila coincida. Que el UPDATE "funcione" sobre cero filas es el rechazo, y
  // por eso se comprueba el efecto y no la excepción.
  const ascendidas = (await c.query(
    `update public.workspace_members set role = 'owner' where workspace_id = $1`, [WS]
  )).rowCount;
  const rolFinal = (await c.query('select public.workspace_role($1) as r', [WS])).rows[0].r;
  ok('no puede ascenderse a administrador', ascendidas === 0 && rolFinal === 'collaborator',
     `afectó ${ascendidas} filas y quedó como ${rolFinal}`);

  // ------------------------------------------------------------ el dueño sigue pudiendo
  console.log('\n--- el administrador no perdió nada ---\n');
  await c.query('reset role');
  const { rows: authD } = await c.query('select auth_id from public.users where id = $1', [DUENIO]);
  await c.query('select set_config($1, $2, true)', [
    'request.jwt.claims', JSON.stringify({ sub: authD[0].auth_id }),
  ]);
  await c.query('set local role authenticated');

  ok('el administrador ve todos los movimientos',
    (await cuantas('select count(*) as n from public.transactions where workspace_id=$1 and deleted_at is null', [WS])) > 100);
  ok('el administrador ve las billeteras',
    (await cuantas('select count(*) as n from public.wallets where workspace_id=$1', [WS])) > 0);
  ok('el administrador ve a los socios',
    (await c.query('select count(*) as n from public.partner_positions($1)', [WS])).rows.length >= 0);
  ok('el administrador consulta saldos',
    (await c.query('select public.wallet_expected_balance((select id from public.wallets where workspace_id=$1 limit 1)) as s', [WS])).rows.length === 1);
  ok('el administrador lista los miembros',
    (await c.query('select * from public.list_workspace_members($1)', [WS])).rows.length > 0);

  // Ver todo no es poder cambiar todo (DB/045): cada uno edita lo que cargó.
  const tocoAjeno = (await c.query('update public.transactions set amount = 1 where id = $1', [mio[0].id])).rowCount;
  ok('el administrador no edita un movimiento que cargó otro', tocoAjeno === 0, `afectó ${tocoAjeno}`);
  const borroAjeno = (await c.query('delete from public.transactions where id = $1', [mio[0].id])).rowCount;
  ok('el administrador no borra un movimiento que cargó otro', borroAjeno === 0, `borró ${borroAjeno}`);

  // Reorganizar categorías sí toca movimientos de todos: es estructura del
  // espacio, no el contenido de un movimiento. Por eso va por función.
  const { rows: [cats] } = await c.query(
    `select (select id from public.categories where workspace_id=$1 order by id limit 1) as a,
            (select id from public.categories where workspace_id=$1 order by id desc limit 1) as b`, [WS]);
  const deOtros = await cuantas(
    'select count(*) as n from public.transactions where category_id=$1 and user_id <> public.current_user_id()', [cats.a]);
  const movidos = (await c.query('select public.transferir_categoria($1, $2) as n', [cats.a, cats.b])).rows[0].n;
  ok('el administrador pasa de categoría también los movimientos de otros',
    deOtros === 0 || movidos >= deOtros, `había ${deOtros} ajenos, movió ${movidos}`);
} finally {
  await c.query('rollback').catch(() => {});
  await c.end();
}

console.log(fallas === 0 ? '\nTodo bien: el colaborador no ve nada que no sea suyo.' : `\n${fallas} falla(s) de seguridad.`);
process.exit(fallas === 0 ? 0 : 1);
