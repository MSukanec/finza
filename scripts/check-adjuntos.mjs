/**
 * Ataca los adjuntos desde tres sesiones —un colaborador, alguien de otro
 * espacio y el administrador— y verifica que cada uno vea exactamente lo que
 * le corresponde. La tabla Y el bucket, que son dos puertas distintas.
 *
 *   node scripts/check-adjuntos.mjs        (o: npm run check:adjuntos)
 *
 * Por qué existe: una factura dice a quién se le compra y cuánto. El bucket es
 * privado, pero eso sólo significa que no hay URL pública: quién puede firmar
 * una URL lo deciden las políticas de `storage.objects`, y quién sabe qué
 * archivo pedir lo deciden las de la tabla. Si cualquiera de las dos tiene un
 * agujero, el comprobante de un socio queda al alcance de otro.
 *
 * Todo pasa dentro de una transacción con ROLLBACK. No queda nada en la base.
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

/** Espera que la base RECHACE la consulta. Entre savepoints: un error aborta la transacción. */
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
    const esperado = /permission denied|row-level security|violates|not allowed/i.test(e.message);
    if (esperado) console.log(`OK    ${nombre}`);
    else { fallas++; console.log(`FALLA ${nombre} -> falló por otra razón: ${e.message}`); }
  }
}

const cuantas = async (sql, params = []) => Number((await c.query(sql, params)).rows[0].n);

/** Pasa a ser esa persona: su token, su rol de base. */
async function ser(userId) {
  await c.query('reset role');
  const { rows } = await c.query('select auth_id from public.users where id = $1', [userId]);
  await c.query('select set_config($1, $2, true)', ['request.jwt.claims', JSON.stringify({ sub: rows[0].auth_id })]);
  await c.query('set local role authenticated');
}

const WS = '06a79300-cec3-49b1-841b-de5a032754f5'; // Samurai
const COLAB = 'b1371501-5393-4b7f-b2ef-693a7a1a3352'; // dev@finza.app, que no es miembro

await c.query('begin');

try {
  // ------------------------------------------------------------ preparar (como postgres)
  const { rows: duenios } = await c.query(
    `select user_id from public.workspace_members where workspace_id=$1 and role='owner' limit 1`, [WS]
  );
  const DUENIO = duenios[0].user_id;

  // Un extraño: alguien que se registró y tiene su espacio, sin relación con
  // Samurai. Se da de alta acá, dentro de la transacción, por el mismo camino
  // que cualquier persona nueva: el trigger de alta le crea su usuario y su
  // espacio "Principal". Buscar uno existente no sirve —hoy todos los que
  // tienen espacio propio son también socios de Samurai— y una prueba que
  // depende de que exista alguien así se saltea sola el día que no exista.
  const { rows: [authExt] } = await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             'extranio-' || gen_random_uuid() || '@prueba.local', '{}'::jsonb, now(), now())
     returning id`
  );
  let { rows: [ext] } = await c.query('select id from public.users where auth_id = $1', [authExt.id]);
  if (!ext) throw new Error('El alta de usuario no creó la fila en public.users');
  const EXTRANIO = ext.id;
  let { rows: [wsExt] } = await c.query(
    'select workspace_id from public.workspace_members where user_id = $1 limit 1', [EXTRANIO]
  );
  if (!wsExt) {
    ({ rows: [wsExt] } = await c.query(
      `insert into public.workspaces (user_id, name) values ($1, 'Principal') returning id as workspace_id`, [EXTRANIO]
    ));
  }
  const WS_EXTRANIO = wsExt.workspace_id;

  await c.query(
    `insert into public.workspace_members (workspace_id, user_id, role) values ($1,$2,'collaborator')
     on conflict (workspace_id, user_id) do update set role = 'collaborator'`,
    [WS, COLAB]
  );

  const { rows: w } = await c.query('select id from public.wallets where workspace_id=$1 limit 1', [WS]);
  const { rows: [mio] } = await c.query(
    `insert into public.transactions (user_id, workspace_id, wallet_id, type, amount, currency_code, description, date)
     values ($1,$2,$3,'expense',100,'ARS','ticket del colaborador', now()) returning id`,
    [COLAB, WS, w[0].id]
  );
  const { rows: [ajeno] } = await c.query(
    `insert into public.transactions (user_id, workspace_id, wallet_id, type, amount, currency_code, description, date)
     values ($1,$2,$3,'expense',999,'ARS','factura del administrador', now()) returning id`,
    [DUENIO, WS, w[0].id]
  );

  // El comprobante del administrador: la fila y el archivo.
  const rutaAjena = `${WS}/${ajeno.id}/00000000-0000-0000-0000-000000000001-factura.pdf`;
  await c.query(
    `insert into storage.objects (bucket_id, name) values ('adjuntos', $1)`, [rutaAjena]
  );
  const { rows: [adjAjeno] } = await c.query(
    `insert into public.transaction_attachments (transaction_id, storage_path, file_name, mime_type, size_bytes, user_id)
     values ($1, $2, 'factura.pdf', 'application/pdf', 1000, $3) returning id, workspace_id`,
    [ajeno.id, rutaAjena, DUENIO]
  );
  ok('la base completa sola el espacio del adjunto', adjAjeno.workspace_id === WS);

  // ============================================================ el colaborador
  console.log('\n--- el colaborador, con lo suyo ---\n');
  await ser(COLAB);

  const rutaMia = `${WS}/${mio.id}/00000000-0000-0000-0000-000000000002-ticket.jpg`;
  const subio = (await c.query(
    `insert into storage.objects (bucket_id, name) values ('adjuntos', $1)`, [rutaMia]
  )).rowCount;
  ok('sube el archivo de un movimiento suyo', subio === 1);

  // Manda un espacio y un autor falsos: la base tiene que ignorar los dos.
  const { rows: [adjMio] } = await c.query(
    `insert into public.transaction_attachments (transaction_id, storage_path, file_name, mime_type, size_bytes, workspace_id, user_id)
     values ($1, $2, 'ticket.jpg', 'image/jpeg', 2000, $3, $4) returning id, workspace_id, user_id`,
    [mio.id, rutaMia, WS_EXTRANIO, DUENIO]
  );
  ok('registra el adjunto de un movimiento suyo', !!adjMio);
  ok('el autor es quien sube, aunque mande otro', adjMio.user_id === COLAB, `quedó ${adjMio.user_id}`);
  ok('el espacio es el del movimiento, aunque mande otro', adjMio.workspace_id === WS, `quedó ${adjMio.workspace_id}`);

  ok('ve su adjunto',
    (await cuantas('select count(*) as n from public.transaction_attachments where id = $1', [adjMio.id])) === 1);
  ok('ve su archivo',
    (await cuantas(`select count(*) as n from storage.objects where bucket_id='adjuntos' and name = $1`, [rutaMia])) === 1);

  const quito = (await c.query(
    'update public.transaction_attachments set deleted_at = now() where id = $1', [adjMio.id]
  )).rowCount;
  ok('puede quitar un adjunto suyo (borrado lógico)', quito === 1);

  console.log('\n--- el colaborador, con lo ajeno ---\n');

  const veAdj = await cuantas('select count(*) as n from public.transaction_attachments where workspace_id = $1', [WS]);
  ok('no ve los adjuntos de movimientos ajenos', veAdj === 1, `ve ${veAdj}`);
  ok('no ve el archivo de un movimiento ajeno',
    (await cuantas(`select count(*) as n from storage.objects where bucket_id='adjuntos' and name = $1`, [rutaAjena])) === 0);

  await negado('no puede subir un archivo a un movimiento ajeno',
    `insert into storage.objects (bucket_id, name) values ('adjuntos', $1)`,
    [`${WS}/${ajeno.id}/00000000-0000-0000-0000-000000000003-colado.pdf`]);

  await negado('no puede colgar un adjunto de un movimiento ajeno',
    `insert into public.transaction_attachments (transaction_id, storage_path, file_name, size_bytes)
     values ($1, $2, 'colado.pdf', 1)`,
    [ajeno.id, `${WS}/${ajeno.id}/colado.pdf`]);

  // El truco: un adjunto propio que apunta al archivo de otro, para después
  // pedir una URL firmada. La ruta tiene que ser la de SU movimiento.
  await negado('no puede registrar un adjunto propio que apunte a un archivo ajeno',
    `insert into public.transaction_attachments (transaction_id, storage_path, file_name, size_bytes)
     values ($1, $2, 'robado.pdf', 1)`,
    [mio.id, rutaAjena]);

  const quitoAjeno = (await c.query(
    'update public.transaction_attachments set deleted_at = now() where id = $1', [adjAjeno.id]
  )).rowCount;
  ok('no puede quitar el adjunto de un movimiento ajeno', quitoAjeno === 0, `afectó ${quitoAjeno}`);

  await negado('no puede mover un adjunto a otro movimiento',
    'update public.transaction_attachments set transaction_id = $2 where id = $1', [adjMio.id, ajeno.id]);
  await negado('no puede cambiar la ruta del archivo',
    'update public.transaction_attachments set storage_path = $2 where id = $1', [adjMio.id, rutaAjena]);
  await negado('no puede borrar la fila de un adjunto',
    'delete from public.transaction_attachments where id = $1', [adjMio.id]);

  const pisados = (await c.query(
    `update storage.objects set name = name where bucket_id = 'adjuntos'`
  )).rowCount;
  ok('no puede pisar ningún archivo del bucket', pisados === 0, `afectó ${pisados}`);

  // ============================================================ alguien de otro espacio
  console.log('\n--- alguien de otro espacio ---\n');
  await ser(EXTRANIO);

  ok('no ve ningún adjunto de Samurai',
    (await cuantas('select count(*) as n from public.transaction_attachments where workspace_id = $1', [WS])) === 0);
  ok('no ve ningún archivo de Samurai',
    (await cuantas(`select count(*) as n from storage.objects where bucket_id='adjuntos' and name like $1`, [`${WS}/%`])) === 0);

  await negado('no puede subir a la carpeta de Samurai',
    `insert into storage.objects (bucket_id, name) values ('adjuntos', $1)`,
    [`${WS}/${ajeno.id}/00000000-0000-0000-0000-000000000004-x.pdf`]);

  // Carpeta de SU espacio, movimiento de Samurai: el espacio no coincide.
  await negado('no puede disfrazar un movimiento ajeno bajo la carpeta de su espacio',
    `insert into storage.objects (bucket_id, name) values ('adjuntos', $1)`,
    [`${WS_EXTRANIO}/${ajeno.id}/00000000-0000-0000-0000-000000000005-x.pdf`]);

  await negado('no puede colgar un adjunto de un movimiento de Samurai',
    `insert into public.transaction_attachments (transaction_id, storage_path, file_name, size_bytes)
     values ($1, $2, 'x.pdf', 1)`,
    [ajeno.id, `${WS}/${ajeno.id}/x.pdf`]);

  // Una carpeta que no es un uuid no tiene que romper la política: tiene que negar.
  await negado('una ruta con cualquier cosa se rechaza, no rompe',
    `insert into storage.objects (bucket_id, name) values ('adjuntos', 'cualquier/cosa/archivo.pdf')`);

  // ============================================================ el administrador
  console.log('\n--- el administrador ---\n');
  await ser(DUENIO);

  ok('ve el adjunto de su movimiento',
    (await cuantas('select count(*) as n from public.transaction_attachments where id = $1', [adjAjeno.id])) === 1);
  ok('ve el adjunto que cargó el colaborador',
    (await cuantas('select count(*) as n from public.transaction_attachments where id = $1', [adjMio.id])) === 1);
  ok('ve los dos archivos',
    (await cuantas(`select count(*) as n from storage.objects where bucket_id='adjuntos' and name in ($1, $2)`, [rutaAjena, rutaMia])) === 2);

  // Como postgres: la sesión de un usuario no lee `storage.buckets`, y un
  // "no lo veo" acá daría por privado un bucket que no se pudo mirar.
  await c.query('reset role');
  const { rows: [bucket] } = await c.query(`select public from storage.buckets where id = 'adjuntos'`);
  ok('el bucket es privado', bucket?.public === false);
} finally {
  await c.query('rollback').catch(() => {});
  await c.end();
}

console.log(fallas === 0 ? '\nTodo bien: cada uno ve sólo los comprobantes que le corresponden.' : `\n${fallas} falla(s) de seguridad.`);
process.exit(fallas === 0 ? 0 : 1);
