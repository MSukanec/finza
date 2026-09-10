/**
 * Carga una planilla de movimientos directo a la base.
 * ====================================================
 * El parseo, el emparejamiento y la deduplicación NO viven acá: son los mismos
 * que usa la app, en `src/lib/import`. Este archivo sólo pone la parte que la
 * app no tiene — conexión directa por `DATABASE_URL`, simulacro y transacción.
 *
 * Uso:
 *   node scripts/import-movimientos.mjs samples/movimientos.csv --workspace Samurai
 *   node scripts/import-movimientos.mjs samples/movimientos.csv --workspace Samurai --apply
 *
 * Sin --apply es SIMULACRO: no escribe nada, sólo informa qué haría y qué filas
 * no puede resolver. Corré siempre el simulacro primero.
 *
 * Banderas:
 *   --apply            escribe de verdad
 *   --create-missing   crea las categorías que la planilla usa y no existen
 *   --repetidas        importa también las filas que ya están cargadas
 *
 * Columnas esperadas (por nombre, en cualquier orden):
 *   FECHA PERC. | FECHA DEV. | TIPO | CATEGORIA | SUBCATEGORIA | DETALLE | BILLETERA | TOTAL
 *   FIAT es opcional y sirve para desambiguar billeteras con el mismo nombre en
 *   distintas monedas (Efectivo ARS vs Efectivo USD).
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// El motor está en TypeScript, con el resto de la app. Registrar el loader acá
// permite seguir corriendo esto con un `node scripts/...` pelado, sin flags.
register('./tsx-loader.mjs', pathToFileURL(path.join(__dirname, '/')));
const {
  clave,
  emparejar,
  emparejarTransferencias,
  ErrorDePlanilla,
  huella,
  interpretar,
  leerPlanilla,
} = await import('../src/lib/import/index.ts');

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local'), quiet: true });

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const CREATE_MISSING = argv.includes('--create-missing');
const CON_REPETIDAS = argv.includes('--repetidas');
const wsName = argv.includes('--workspace') ? argv[argv.indexOf('--workspace') + 1] : 'Samurai';
const file = argv.find((a) => !a.startsWith('--') && a !== argv[argv.indexOf('--workspace') + 1]);

if (!file) {
  console.error('Falta el archivo CSV. Ej: node scripts/import-movimientos.mjs samples/movimientos.csv');
  process.exit(1);
}

// ---------------------------------------------------------------- lectura

let planilla;
try {
  planilla = leerPlanilla(fs.readFileSync(file));
} catch (e) {
  console.error(e instanceof ErrorDePlanilla ? e.message : `No pude leer el archivo: ${e.message}`);
  process.exit(1);
}

console.log(`Codificación: ${planilla.codificacion}  ·  separador: "${planilla.delimitador}"  ·  encabezado en la línea ${planilla.filaEncabezado + 1}`);

const { movimientos, descartadas } = interpretar(planilla);
const { pares, huerfanos } = emparejarTransferencias(movimientos);
const esHuerfano = new Set(huerfanos);
const enPar = new Set(pares.flatMap((p) => [p.salida, p.entrada]));

// ---------------------------------------------------------------- base

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// Se acepta el nombre o el uuid. El nombre YA NO ES ÚNICO: el trigger de alta
// le crea un espacio "Principal" a cada persona que se registra, así que hay
// varios con el mismo nombre y de dueños distintos. Tomar el primero que
// aparezca sería escribir en la base de otro.
const porUuid = /^[0-9a-f-]{36}$/i.test(wsName);
const { rows: wsRows } = await client.query(
  porUuid
    ? 'select id, user_id, name from public.workspaces where id = $1 and deleted_at is null'
    : 'select id, user_id, name from public.workspaces where name = $1 and deleted_at is null',
  [wsName]
);

if (!wsRows.length) {
  console.error(`No existe el espacio "${wsName}"`);
  await client.end();
  process.exit(1);
}
if (wsRows.length > 1) {
  console.error(`Hay ${wsRows.length} espacios llamados "${wsName}" y son de dueños distintos.`);
  console.error('Pasá el uuid en vez del nombre:');
  for (const r of wsRows) console.error(`  --workspace ${r.id}`);
  await client.end();
  process.exit(1);
}
const { id: wsId, user_id: userId } = wsRows[0];

const cargarCategorias = async () => {
  const { rows } = await client.query(
    `select c.id, c.name, c.type, g.name as grupo
       from public.categories c join public.category_groups g on g.id = c.group_id
      where c.workspace_id = $1 and c.deleted_at is null`,
    [wsId]
  );
  return rows;
};

let cats = await cargarCategorias();
const { rows: wallets } = await client.query(
  'select id, name, currency_code from public.wallets where workspace_id = $1 and deleted_at is null',
  [wsId]
);

// Las huellas de lo que ya está cargado, para no volver a importarlo. La
// columna la llena un trigger (DB/029), así que acá se lee y no se recalcula.
const { rows: yaCargadas } = await client.query(
  `select t.fingerprint from public.transactions t
    where t.workspace_id = $1 and t.deleted_at is null and t.fingerprint is not null`,
  [wsId]
);
// Cuántas veces está cargada cada huella, no si está: dos filas idénticas —el
// mismo comercio facturando dos veces el mismo día por el mismo importe— son dos
// gastos reales, y preguntar por presencia se come el segundo en silencio.
const huellasCargadas = new Map();
for (const t of yaCargadas) huellasCargadas.set(t.fingerprint, (huellasCargadas.get(t.fingerprint) ?? 0) + 1);

// ---------------------------------------------------------------- resolución

const catKey = (grupo, nombre, tipo) => `${clave(grupo)}|${clave(nombre)}|${tipo}`;

function indexarCategorias(filas) {
  return new Map(filas.map((c) => [catKey(c.grupo, c.name, c.type), c.id]));
}
let catMap = indexarCategorias(cats);

const walletMap = new Map();
for (const w of wallets) {
  walletMap.set(`${clave(w.name)}|${clave(w.currency_code)}`, w.id);
  // Sin moneda declarada, el nombre sólo sirve si es único entre monedas.
  const solo = clave(w.name);
  walletMap.set(solo, walletMap.has(solo) ? 'AMBIGUO' : w.id);
}

const monedaDe = (m, walletId) =>
  m.moneda ?? wallets.find((w) => w.id === walletId)?.currency_code ?? 'ARS';

function resolverBilletera(m) {
  const id = m.moneda ? walletMap.get(`${clave(m.billetera)}|${clave(m.moneda)}`) : walletMap.get(clave(m.billetera));
  if (id && id !== 'AMBIGUO') return { id };
  if (id === 'AMBIGUO') {
    return { falla: `Billetera "${m.billetera}" existe en varias monedas y la fila no trae FIAT` };
  }
  // No matcheó exacto: se ofrece la más parecida, pero no se aplica sola.
  const candidatas = m.moneda ? wallets.filter((w) => w.currency_code === m.moneda) : wallets;
  const cerca = emparejar(m.billetera, candidatas, (w) => w.name);
  if (cerca && cerca.confianza !== 'sugerida') return { id: cerca.item.id };
  return {
    falla: `Sin billetera: "${m.billetera}"${m.moneda ? ` (${m.moneda})` : ''}${cerca ? ` — ¿será "${cerca.item.name}"?` : ''}`,
  };
}

function resolverCategoria(m, faltantes) {
  const id = catMap.get(catKey(m.grupo, m.categoria, m.tipo));
  if (id) return { id };

  const candidatas = cats.filter((c) => c.type === m.tipo);
  const cerca = emparejar(m.categoria, candidatas, (c) => c.name);
  if (cerca && cerca.confianza !== 'sugerida') return { id: cerca.item.id };

  if (CREATE_MISSING) {
    faltantes.set(catKey(m.grupo, m.categoria, m.tipo), { grupo: m.grupo, sub: m.categoria, type: m.tipo });
    return { pendiente: true };
  }
  return {
    falla: `Sin categoría: "${m.grupo}" > "${m.categoria}" (${m.tipo})${cerca ? ` — ¿será "${cerca.item.name}"?` : ''}`,
  };
}

function resolver() {
  const listas = [];
  const problemas = [];
  const faltantes = new Map();
  // Copia por corrida: cada fila salteada consume una de las ya cargadas.
  const restantes = new Map(huellasCargadas);
  let repetidas = 0;

  // Transferencias emparejadas: dos filas ligadas entre sí. La pata entrante va
  // con monto negativo, que es como la app hace subir el saldo del destino.
  for (const par of pares) {
    const salida = resolverBilletera(par.salida);
    const entrada = resolverBilletera(par.entrada);
    if (salida.falla || entrada.falla) {
      problemas.push({ linea: par.salida.linea, fails: [salida.falla ?? entrada.falla] });
      continue;
    }
    const moneda = monedaDe(par.salida, salida.id);
    const detalle = par.salida.detalle || 'Transferencia';
    const idSalida = crypto.randomUUID();

    // El enlace va en un solo sentido, igual que en `addTransaction` de la app:
    // la FK no es diferible, así que la pata entrante apunta a la saliente y se
    // inserta después.
    listas.push({
      id: idSalida, wallet_id: salida.id, category_id: null, type: 'transfer',
      amount: par.salida.monto, currency_code: moneda, description: detalle,
      date: par.salida.fecha, invoiced_at: null, status: 'draft', related_transaction_id: null,
    });
    listas.push({
      id: crypto.randomUUID(), wallet_id: entrada.id, category_id: null, type: 'transfer',
      amount: -par.entrada.monto, currency_code: moneda,
      description: `Transferencia entrante: ${detalle}`,
      date: par.entrada.fecha, invoiced_at: null, status: 'draft', related_transaction_id: idSalida,
    });
  }

  for (const m of movimientos) {
    if (enPar.has(m)) continue;

    const fails = [];
    const billetera = resolverBilletera(m);
    if (billetera.falla) fails.push(billetera.falla);

    let categoria = { id: null };
    if (!m.esTransferencia) {
      categoria = resolverCategoria(m, faltantes);
      if (categoria.falla) fails.push(categoria.falla);
    }

    if (fails.length) {
      problemas.push({ linea: m.linea, fails });
      continue;
    }
    if (categoria.pendiente) continue; // se resuelve en la segunda vuelta

    const h = huella({
      fecha: m.fecha, monto: m.monto, walletId: billetera.id, tipo: m.tipo, detalle: m.detalle,
    });
    const yaHay = restantes.get(h) ?? 0;
    if (!CON_REPETIDAS && !m.esTransferencia && yaHay > 0) {
      restantes.set(h, yaHay - 1);
      repetidas++;
      continue;
    }

    listas.push({
      id: crypto.randomUUID(),
      wallet_id: billetera.id,
      category_id: categoria.id ?? null,
      type: m.tipo,
      amount: m.monto,
      currency_code: monedaDe(m, billetera.id),
      description: m.detalle,
      date: m.fecha,
      invoiced_at: m.fechaFacturado,
      // Un pase sin pareja entra marcado para revisar en vez de perderse.
      status: esHuerfano.has(m) ? 'warning' : 'draft',
      related_transaction_id: null,
    });
  }

  return { listas, problemas, faltantes, repetidas };
}

let { listas, problemas, faltantes, repetidas } = resolver();

// ---------------------------------------------------------------- faltantes

if (faltantes.size) {
  console.log(`\nCategorías que faltan y hay que crear: ${faltantes.size}`);
  for (const { grupo, sub, type } of [...faltantes.values()].sort(
    (a, b) => a.grupo.localeCompare(b.grupo) || a.sub.localeCompare(b.sub)
  )) {
    console.log(`  ${grupo} > ${sub}  (${type === 'income' ? 'ingreso' : 'egreso'})`);
  }

  if (APPLY) {
    await client.query('begin');
    try {
      for (const { grupo, sub, type } of faltantes.values()) {
        let { rows: g } = await client.query(
          'select id from public.category_groups where workspace_id = $1 and name = $2',
          [wsId, grupo]
        );
        if (!g.length) {
          ({ rows: g } = await client.query(
            `insert into public.category_groups (user_id, name, is_system, workspace_id)
             values ($1,$2,false,$3) returning id`,
            [userId, grupo, wsId]
          ));
        }
        await client.query(
          `insert into public.categories
             (user_id, name, type, group_name, group_id, is_recurring, workspace_id)
           values ($1,$2,$3,$4,$5,false,$6)`,
          [userId, sub, type, grupo, g[0].id, wsId]
        );
      }
      await client.query('commit');
      console.log(`Creadas ${faltantes.size} categorías.`);
    } catch (e) {
      await client.query('rollback');
      console.error('ERROR creando categorías:', e.message);
      await client.end();
      process.exit(1);
    }

    cats = await cargarCategorias();
    catMap = indexarCategorias(cats);
    ({ listas, problemas, repetidas } = resolver());
  }
}

// ---------------------------------------------------------------- informe

const sinMonto = descartadas.filter((d) => d.motivo === 'sinMonto').length;
const ilegibles = descartadas.filter((d) => d.motivo === 'ilegible');

console.log(`\nEspacio: ${wsName}`);
console.log(`  Listas para cargar   : ${listas.length}`);
console.log(`  Transferencias       : ${pares.length} pares · ${huerfanos.length} sin pareja`);
console.log(`  Ya cargadas (salteadas): ${repetidas}`);
console.log(`  Sin monto (salteadas): ${sinMonto}`);
console.log(`  Con problemas        : ${problemas.length + ilegibles.length}`);

const motivos = new Map();
const anotarMotivo = (razon, linea) => {
  if (!motivos.has(razon)) motivos.set(razon, []);
  motivos.get(razon).push(linea);
};
for (const p of problemas) for (const f of p.fails) anotarMotivo(f, p.linea);
for (const d of ilegibles) for (const f of d.problemas) anotarMotivo(f, d.linea);

if (motivos.size) {
  console.log('\n--- Motivos ---');
  for (const [razon, lineas] of [...motivos.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(lineas.length).padStart(4)}x  ${razon}`);
    console.log(`        líneas: ${lineas.slice(0, 10).join(', ')}${lineas.length > 10 ? '…' : ''}`);
  }
}

if (!APPLY) {
  console.log('\nSIMULACRO: no se escribió nada. Agregá --apply para cargar de verdad.\n');
  await client.end();
  process.exit(0);
}

if (!listas.length) {
  console.log('\nNo hay nada para cargar.\n');
  await client.end();
  process.exit(0);
}

// ---------------------------------------------------------------- carga

await client.query('begin');
try {
  // El lote es una fila con identidad propia (DB/029): guarda el archivo del que
  // vino, la codificacion detectada y los conteos, y es a lo que apuntan los
  // movimientos. Antes era una cadena suelta repetida en cada fila.
  const { rows: loteRows } = await client.query(
    `insert into public.import_batches
       (workspace_id, user_id, source, file_name, encoding, delimiter, rows_read, rows_imported, rows_skipped)
     values ($1,$2,'planilla',$3,$4,$5,$6,$7,$8) returning id`,
    [wsId, userId, path.basename(file), planilla.codificacion, planilla.delimitador,
     movimientos.length, listas.length, repetidas + sinMonto]
  );
  const batch = loteRows[0].id;

  for (const t of listas) {
    await client.query(
      `insert into public.transactions
         (id, user_id, wallet_id, category_id, type, amount, currency_code, description,
          date, invoiced_at, import_batch, import_batch_id, is_checkpoint, status,
          workspace_id, related_transaction_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,false,$12,$13,$14)`,
      [t.id, userId, t.wallet_id, t.category_id, t.type, t.amount, t.currency_code,
       t.description, t.date, t.invoiced_at, batch, t.status, wsId, t.related_transaction_id]
    );
  }
  await client.query('commit');
  console.log(`\nCargados ${listas.length} movimientos. Lote ${batch}`);
  console.log(`Revertir:  node scripts/db.mjs -c "update transactions set deleted_at=now() where import_batch_id='${batch}'"\n`);
} catch (e) {
  await client.query('rollback');
  console.error('\nERROR, no se cargó nada:', e.message, '\n');
  process.exitCode = 1;
}

await client.end();
