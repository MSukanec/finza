/**
 * Borrar categorías y macrogrupos con reemplazo (DB/047), contra la base real.
 *
 *   node scripts/check-categorias.mjs        (o: npm run check:categorias)
 *
 * Arma categorías, grupos, movimientos, una deuda, un presupuesto y una regla
 * de mentira dentro de una transacción, borra y reemplaza, mira qué quedó y
 * hace ROLLBACK. No queda nada en la base.
 *
 * Cada caso es algo que se rompía o que se rompería en silencio: un presupuesto
 * apuntando a una categoría borrada, gastos que pasan a contar como ingresos,
 * dos "General" en el mismo grupo partiendo los reportes.
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
  // ------------------------------------------------------------ preparar (como postgres)
  const { user_id: DUENIO } = await uno(
    `select user_id from public.workspace_members where workspace_id=$1 and role='owner' limit 1`, [WS]);
  const { id: OTRO_WS } = await uno(`select id from public.workspaces where id <> $1 limit 1`, [WS]);
  const { id: BILLETERA } = await uno('select id from public.wallets where workspace_id=$1 limit 1', [WS]);

  const grupo = async (nombre, ws = WS) =>
    (await uno(`insert into public.category_groups (user_id, workspace_id, name) values ($1,$2,$3) returning id`,
      [DUENIO, ws, nombre])).id;
  // group_name a propósito MAL: el trigger lo tiene que corregir.
  const categoria = async (nombre, g, tipo = 'expense', ws = WS) =>
    (await uno(`insert into public.categories (user_id, workspace_id, name, type, group_id, group_name)
                values ($1,$2,$3,$4,$5,'cualquier cosa') returning id, group_name`, [DUENIO, ws, nombre, tipo, g]));
  const movimiento = async (cat, autor = DUENIO, deBaja = false) =>
    (await uno(`insert into public.transactions (user_id, workspace_id, wallet_id, category_id, type, amount, currency_code, description, date, deleted_at)
                values ($1,$2,$3,$4,'expense',10,'ARS','prueba', now(), $5) returning id`,
      [autor, WS, BILLETERA, cat, deBaja ? new Date() : null])).id;

  const G_PROV = await grupo('zz Proveedores prueba');
  const G_INS = await grupo('zz Insumos prueba');
  const G_VACIO = await grupo('zz Vacío prueba');

  const pesca = await categoria('Pescadería', G_PROV);
  const carne = await categoria('Carnicería', G_PROV);
  const general = await categoria('General', G_PROV);
  const generalIns = await categoria('general', G_INS); // gemela, con otra mayúscula
  const sinUso = await categoria('Sin uso', G_PROV);
  const ingreso = await categoria('Ventas prueba', G_PROV, 'income');
  const deOtroEspacio = await categoria('Ajena', await grupo('zz ajeno', OTRO_WS), 'expense', OTRO_WS);

  console.log('\n--- el nombre del grupo lo pone la base ---\n');
  ok('al crear, la categoría copia el nombre real de su grupo', pesca.group_name === 'zz Proveedores prueba', pesca.group_name);
  await c.query(`update public.category_groups set name = 'zz Proveedores renombrado' where id = $1`, [G_PROV]);
  ok('renombrar el grupo renombra lo que dicen sus categorías',
    (await valor('select group_name from public.categories where id=$1', [pesca.id])) === 'zz Proveedores renombrado');
  await c.query(`update public.categories set group_name = 'mentira' where id = $1`, [carne.id]);
  ok('no se puede escribir un nombre de grupo que no es el suyo',
    (await valor('select group_name from public.categories where id=$1', [carne.id])) === 'zz Proveedores renombrado');
  ok('no quedó ninguna categoría con el nombre de grupo desincronizado',
    Number(await valor(`select count(*) from public.categories c join public.category_groups g on g.id=c.group_id
                         where c.deleted_at is null and c.group_name <> g.name`)) === 0);

  // Uso de Pescadería: 2 movimientos de dos personas, 1 de baja, 1 deuda, 1 presupuesto, 1 regla.
  await movimiento(pesca.id, DUENIO);
  const movDeLaEncargada = await movimiento(pesca.id, COLAB);
  const movDeBaja = await movimiento(pesca.id, DUENIO, true);
  const { id: deuda } = await uno(
    `insert into public.debts (user_id, workspace_id, category_id, total_amount, currency_code, description)
     values ($1,$2,$3,100,'ARS','prueba') returning id`, [DUENIO, WS, pesca.id]);
  const { id: presupuesto } = await uno(
    `insert into public.budgets (user_id, workspace_id, name, period) values ($1,$2,'prueba','monthly') returning id`, [DUENIO, WS]);
  // El presupuesto ya tiene las dos: se tienen que sumar.
  await c.query(`insert into public.budget_categories (budget_id, category_id, limit_amount) values ($1,$2,100),($1,$3,50)`,
    [presupuesto, pesca.id, carne.id]);
  const { id: regla } = await uno(
    `insert into public.import_rules (workspace_id, user_id, field, match_type, pattern, type, category_id)
     values ($1,$2,'detalle','contains','zz pescaderia prueba','expense',$3) returning id`, [WS, DUENIO, pesca.id]);

  await movimiento(generalIns.id);

  // ============================================================ el administrador
  await ser(DUENIO);

  console.log('\n--- en uso ---\n');
  const uso = await valor('select public.uso_de_categoria($1)', [pesca.id]);
  ok('cuenta los movimientos vivos, de cualquier persona', uso.movimientos === 2, JSON.stringify(uso));
  ok('cuenta los dados de baja, que un vaciado puede revivir', uso.movimientos_de_baja === 1);
  ok('cuenta las deudas', uso.deudas === 1);
  ok('cuenta los presupuestos', uso.presupuestos === 1);
  ok('cuenta las reglas de importación', uso.reglas === 1);
  ok('el total suma todo', uso.total === 6, uso.total);
  ok('una categoría sin nada está en cero', (await valor('select public.uso_de_categoria($1)', [sinUso.id])).total === 0);

  console.log('\n--- borrar una categoría ---\n');
  await c.query('select public.borrar_categoria($1)', [sinUso.id]);
  ok('sin uso, se borra sin pedir reemplazo',
    (await valor('select deleted_at is not null from public.categories where id=$1', [sinUso.id])) === true);

  await negado('en uso y sin reemplazo, se niega',
    'select public.borrar_categoria($1)', [pesca.id], /está en uso/);
  await negado('no se reemplaza por sí misma',
    'select public.borrar_categoria($1, $1)', [pesca.id], /sí misma/);
  await negado('no se reemplaza un egreso por un ingreso',
    'select public.borrar_categoria($1, $2)', [pesca.id, ingreso.id], /egresos.*ingresos/);
  await negado('no se reemplaza por una categoría de otro espacio',
    'select public.borrar_categoria($1, $2)', [pesca.id, deOtroEspacio.id], /no encontrada|otro espacio|no existe/);
  ok('después de un intento fallido no cambió nada',
    (await valor('select public.uso_de_categoria($1)', [pesca.id])).total === 6);

  await c.query('select public.borrar_categoria($1, $2)', [pesca.id, carne.id]);
  await c.query('reset role');
  ok('la categoría quedó borrada', (await valor('select deleted_at is not null from public.categories where id=$1', [pesca.id])) === true);
  ok('los movimientos pasaron, incluido el de la encargada',
    (await valor('select category_id from public.transactions where id=$1', [movDeLaEncargada])) === carne.id);
  ok('el dado de baja también pasó',
    (await valor('select category_id from public.transactions where id=$1', [movDeBaja])) === carne.id);
  ok('la deuda pasó', (await valor('select category_id from public.debts where id=$1', [deuda])) === carne.id);
  ok('la regla de importación pasó', (await valor('select category_id from public.import_rules where id=$1', [regla])) === carne.id);
  const lineas = (await c.query('select category_id, limit_amount from public.budget_categories where budget_id=$1', [presupuesto])).rows;
  ok('el presupuesto quedó con una sola línea', lineas.length === 1, JSON.stringify(lineas));
  ok('con la suma de los dos límites', Number(lineas[0]?.limit_amount) === 150, lineas[0]?.limit_amount);
  ok('nada apunta a la categoría borrada',
    Number(await valor(`select (select count(*) from public.transactions where category_id=$1)
                            + (select count(*) from public.debts where category_id=$1)
                            + (select count(*) from public.budget_categories where category_id=$1)
                            + (select count(*) from public.import_rules where category_id=$1)`, [pesca.id])) === 0);

  console.log('\n--- borrar un macrogrupo ---\n');
  await ser(DUENIO);
  const usoGrupo = await valor('select public.uso_de_grupo($1)', [G_PROV]);
  ok('el grupo cuenta sus categorías por tipo',
    usoGrupo.categorias_de_egreso === 2 && usoGrupo.categorias_de_ingreso === 1, JSON.stringify(usoGrupo));

  await negado('con categorías y sin reemplazo, se niega',
    'select public.borrar_grupo($1)', [G_PROV], /elegí a qué grupo/);
  const { id: G_SISTEMA } = await uno(`select id from public.category_groups where workspace_id is null and deleted_at is null limit 1`);
  await negado('un grupo del sistema no se borra',
    'select public.borrar_grupo($1)', [G_SISTEMA], /del sistema/);

  await c.query('select public.borrar_grupo($1)', [G_VACIO]);
  ok('un grupo vacío se borra sin pedir reemplazo',
    (await valor('select deleted_at is not null from public.category_groups where id=$1', [G_VACIO])) === true);

  const movDeGeneral = await (async () => { await c.query('reset role'); const id = await movimiento(general.id); await ser(DUENIO); return id; })();
  const r = await valor('select public.borrar_grupo($1, $2)', [G_PROV, G_INS]);
  await c.query('reset role');
  ok('movió las categorías que no existían en el destino', r.movidas === 2, JSON.stringify(r));
  ok('fusionó la que ya existía, aunque cambie la mayúscula', r.fusionadas === 1);
  ok('Carnicería ahora está en el grupo destino, con su nombre',
    (await uno('select group_id, group_name from public.categories where id=$1', [carne.id])).group_name === 'zz Insumos prueba');
  ok('el ingreso también se movió, con su tipo',
    (await uno('select group_id, type from public.categories where id=$1', [ingreso.id])).group_id === G_INS);
  ok('no quedaron dos "General" en el destino',
    Number(await valor(`select count(*) from public.categories where group_id=$1 and lower(name)='general' and deleted_at is null`, [G_INS])) === 1);
  ok('los movimientos de la General fusionada pasaron a la que quedó',
    (await valor('select category_id from public.transactions where id=$1', [movDeGeneral])) === generalIns.id);
  ok('el grupo quedó borrado',
    (await valor('select deleted_at is not null from public.category_groups where id=$1', [G_PROV])) === true);

  // ============================================================ la encargada
  console.log('\n--- la encargada no administra categorías ---\n');
  await c.query(`insert into public.workspace_members (workspace_id, user_id, role) values ($1,$2,'collaborator')
                 on conflict (workspace_id, user_id) do update set role='collaborator'`, [WS, COLAB]);
  await ser(COLAB);
  await negado('no puede ver en qué está usada', 'select public.uso_de_categoria($1)', [carne.id], /acceso/);
  await negado('no puede borrar una categoría', 'select public.borrar_categoria($1, $2)', [carne.id, generalIns.id], /acceso/);
  await negado('no puede borrar un grupo', 'select public.borrar_grupo($1, $2)', [G_INS, G_SISTEMA], /acceso/);
} finally {
  await c.query('rollback').catch(() => {});
  await c.end();
}

console.log(fallas === 0 ? '\nTodo bien: borrar y reemplazar migra todo y no deja nada colgado.' : `\n${fallas} falla(s).`);
process.exit(fallas === 0 ? 0 : 1);
