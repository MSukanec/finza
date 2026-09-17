/**
 * Borrar billeteras con reemplazo (DB/048), contra la base real.
 *
 *   node scripts/check-billeteras.mjs        (o: npm run check:billeteras)
 *
 * Arma billeteras, subcuentas, movimientos, arqueos y reglas de mentira dentro
 * de una transacción, borra y reemplaza, mira qué quedó y hace ROLLBACK.
 *
 * El caso que más importa es el saldo: una billetera vale su saldo inicial más
 * sus movimientos, así que fusionar dos sin sumar los saldos iniciales hace
 * desaparecer plata sin que ningún error lo diga.
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

let sp = 0;
async function negado(nombre, sql, params = [], patron = /./) {
  const punto = `p${sp++}`;
  await c.query(`savepoint ${punto}`);
  try {
    await c.query(sql, params);
    await c.query(`release savepoint ${punto}`);
    fallas++;
    console.log(`FALLA ${nombre} -> la base lo permitió`);
  } catch (e) {
    await c.query(`rollback to savepoint ${punto}`);
    if (patron.test(e.message)) console.log(`OK    ${nombre}`);
    else { fallas++; console.log(`FALLA ${nombre} -> falló por otra razón: ${e.message}`); }
  }
}

const uno = async (sql, params = []) => (await c.query(sql, params)).rows[0];
const valor = async (sql, params = []) => Object.values((await c.query(sql, params)).rows[0])[0];

async function ser(userId) {
  await c.query('reset role');
  const { auth_id } = await uno('select auth_id from public.users where id = $1', [userId]);
  await c.query('select set_config($1, $2, true)', ['request.jwt.claims', JSON.stringify({ sub: auth_id })]);
  await c.query('set local role authenticated');
}

const WS = '06a79300-cec3-49b1-841b-de5a032754f5'; // Samurai
const COLAB = 'b1371501-5393-4b7f-b2ef-693a7a1a3352'; // dev@finza.app

await c.query('begin');

try {
  const { user_id: DUENIO } = await uno(
    `select user_id from public.workspace_members where workspace_id=$1 and role='owner' limit 1`, [WS]);
  const { id: OTRO_WS } = await uno(`select id from public.workspaces where id <> $1 limit 1`, [WS]);

  const billetera = async (nombre, opciones = {}) =>
    (await uno(
      `insert into public.wallets (user_id, workspace_id, name, type, currency_code, initial_balance, parent_id)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [DUENIO, opciones.ws ?? WS, nombre, opciones.tipo ?? 'cash', opciones.moneda ?? 'ARS',
       opciones.saldo ?? 0, opciones.padre ?? null]
    )).id;

  const movimiento = async (w, opciones = {}) =>
    (await uno(
      `insert into public.transactions (user_id, workspace_id, wallet_id, type, amount, currency_code, description, date, deleted_at)
       values ($1,$2,$3,'expense',$4,'ARS','prueba', now(), $5) returning id`,
      [opciones.autor ?? DUENIO, WS, w, opciones.monto ?? 10, opciones.deBaja ? new Date() : null]
    )).id;

  const vieja = await billetera('zz Caja vieja', { saldo: 1000 });
  const nueva = await billetera('zz Caja nueva', { saldo: 500 });
  const enDolares = await billetera('zz Caja en dólares', { moneda: 'USD' });
  const ajena = await billetera('zz Ajena', { ws: OTRO_WS });
  const vaciaSinNada = await billetera('zz Vacía');
  const agrupadora = await billetera('zz Efectivo');
  const hija1 = await billetera('zz Caja 1', { padre: agrupadora });
  const hija2 = await billetera('zz Caja 2', { padre: agrupadora });

  const mio = await movimiento(vieja);
  const deLaEncargada = await movimiento(vieja, { autor: COLAB, monto: 25 });
  const deBaja = await movimiento(vieja, { deBaja: true });
  const { id: arqueo } = await uno(
    `insert into public.wallet_reconciliations (workspace_id, wallet_id, user_id, counted_amount, expected_amount, counted_at)
     values ($1,$2,$3,100,100, now()) returning id`, [WS, vieja, DUENIO]);
  const { id: regla } = await uno(
    `insert into public.import_rules (workspace_id, user_id, field, match_type, pattern, wallet_id)
     values ($1,$2,'billetera','exact','zz caja vieja prueba',$3) returning id`, [WS, DUENIO, vieja]);

  await ser(DUENIO);

  console.log('\n--- en uso ---\n');
  const uso = await valor('select public.uso_de_billetera($1)', [vieja]);
  ok('cuenta los movimientos vivos, de cualquier persona', uso.movimientos === 2, JSON.stringify(uso));
  ok('cuenta los dados de baja', uso.movimientos_de_baja === 1);
  ok('cuenta los arqueos', uso.arqueos === 1);
  ok('cuenta las reglas de importación', uso.reglas === 1);
  ok('informa el saldo inicial', Number(uso.saldo_inicial) === 1000);
  ok('una billetera sin nada está en cero', (await valor('select public.uso_de_billetera($1)', [vaciaSinNada])).total === 0);
  const usoAgrupadora = await valor('select public.uso_de_billetera($1)', [agrupadora]);
  ok('una que agrupa cuenta sus subcuentas', usoAgrupadora.subcuentas === 2 && usoAgrupadora.total === 2, JSON.stringify(usoAgrupadora));

  // Un saldo inicial solo ya es "estar en uso": borrarla sin reemplazo borraría plata.
  const conSaldo = await (async () => { await c.query('reset role'); const id = await billetera('zz Sólo saldo', { saldo: 700 }); await ser(DUENIO); return id; })();
  ok('un saldo inicial distinto de cero cuenta como uso',
    (await valor('select public.uso_de_billetera($1)', [conSaldo])).total === 1);

  console.log('\n--- borrar ---\n');
  await c.query('select public.borrar_billetera($1)', [vaciaSinNada]);
  ok('sin uso, se borra sin pedir reemplazo',
    (await valor('select deleted_at is not null from public.wallets where id=$1', [vaciaSinNada])) === true);

  await negado('en uso y sin reemplazo, se niega',
    'select public.borrar_billetera($1)', [vieja], /está en uso/);
  await negado('no se reemplaza por sí misma',
    'select public.borrar_billetera($1, $1)', [vieja], /sí misma/);
  await negado('no se reemplaza una en pesos por una en dólares',
    'select public.borrar_billetera($1, $2)', [vieja, enDolares], /no se pueden sumar/);
  await negado('no se reemplaza por una de otro espacio',
    'select public.borrar_billetera($1, $2)', [vieja, ajena], /otro espacio|no existe/);
  await negado('no se reemplaza por una que agrupa subcuentas',
    'select public.borrar_billetera($1, $2)', [vieja, agrupadora], /agrupa subcuentas/);
  ok('después de un intento fallido no cambió nada',
    (await valor('select public.uso_de_billetera($1)', [vieja])).total === 6);

  await c.query('select public.borrar_billetera($1, $2)', [vieja, nueva]);
  await c.query('reset role');
  ok('la billetera quedó borrada', (await valor('select deleted_at is not null from public.wallets where id=$1', [vieja])) === true);
  ok('los movimientos pasaron, incluido el de la encargada',
    (await valor('select wallet_id from public.transactions where id=$1', [deLaEncargada])) === nueva);
  ok('el dado de baja también pasó', (await valor('select wallet_id from public.transactions where id=$1', [deBaja])) === nueva);
  ok('el arqueo pasó', (await valor('select wallet_id from public.wallet_reconciliations where id=$1', [arqueo])) === nueva);
  ok('la regla de importación pasó', (await valor('select wallet_id from public.import_rules where id=$1', [regla])) === nueva);
  ok('el saldo inicial se sumó: no desapareció plata',
    Number(await valor('select initial_balance from public.wallets where id=$1', [nueva])) === 1500,
    String(await valor('select initial_balance from public.wallets where id=$1', [nueva])));
  ok('nada quedó apuntando a la borrada',
    Number(await valor(`select (select count(*) from public.transactions where wallet_id=$1)
                            + (select count(*) from public.wallet_reconciliations where wallet_id=$1)
                            + (select count(*) from public.import_rules where wallet_id=$1)`, [vieja])) === 0);
  ok('el movimiento propio también pasó',
    (await valor('select wallet_id from public.transactions where id=$1', [mio])) === nueva);

  console.log('\n--- subcuentas ---\n');
  await ser(DUENIO);
  await c.query('select public.borrar_billetera($1, $2)', [agrupadora, nueva]);
  await c.query('reset role');
  ok('las subcuentas quedan sueltas, no se borran',
    Number(await valor(`select count(*) from public.wallets where id in ($1,$2) and deleted_at is null and parent_id is null`, [hija1, hija2])) === 2);
  ok('la que agrupaba quedó borrada',
    (await valor('select deleted_at is not null from public.wallets where id=$1', [agrupadora])) === true);

  console.log('\n--- la encargada no administra billeteras ---\n');
  await c.query(`insert into public.workspace_members (workspace_id, user_id, role) values ($1,$2,'collaborator')
                 on conflict (workspace_id, user_id) do update set role='collaborator'`, [WS, COLAB]);
  await ser(COLAB);
  await negado('no puede ver en qué está usada', 'select public.uso_de_billetera($1)', [nueva], /acceso/);
  await negado('no puede borrar una billetera', 'select public.borrar_billetera($1, $2)', [nueva, hija1], /acceso/);
} finally {
  await c.query('rollback').catch(() => {});
  await c.end();
}

console.log(fallas === 0 ? '\nTodo bien: borrar una billetera no pierde movimientos ni plata.' : `\n${fallas} falla(s).`);
process.exit(fallas === 0 ? 0 : 1);
