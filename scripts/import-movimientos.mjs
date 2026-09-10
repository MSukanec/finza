/**
 * Carga la hoja MOVIMIENTOS del Excel de Samurai directo a la base.
 * ================================================================
 * No pasa por el importador de la app: lee el CSV, resuelve categorías y
 * billeteras contra lo que ya existe en el espacio, y hace los INSERT.
 *
 * Uso:
 *   node scripts/import-movimientos.mjs samples/movimientos.csv --workspace Samurai
 *   node scripts/import-movimientos.mjs samples/movimientos.csv --workspace Samurai --apply
 *
 * Sin --apply es SIMULACRO: no escribe nada, solo informa qué haría y qué
 * filas no puede resolver. Corré siempre el simulacro primero.
 *
 * Columnas esperadas (por nombre, en cualquier orden):
 *   FECHA PERC. | FECHA DEV. | TIPO | CATEGORIA | SUBCATEGORIA | DETALLE | BILLETERA | TOTAL
 *   FIAT es opcional y sirve para desambiguar billeteras con el mismo nombre
 *   en distintas monedas (Efectivo ARS vs Efectivo USD).
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local'), quiet: true });

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const CREATE_MISSING = argv.includes('--create-missing');
const file = argv.find((a) => !a.startsWith('--') && a !== argv[argv.indexOf('--workspace') + 1]);
const wsName = argv.includes('--workspace') ? argv[argv.indexOf('--workspace') + 1] : 'Samurai';

if (!file) {
  console.error('Falta el archivo CSV. Ej: node scripts/import-movimientos.mjs samples/movimientos.csv');
  process.exit(1);
}

// ---------------------------------------------------------------- CSV

/** Parser de CSV con comillas. No uso papaparse para no depender del bundle de la app. */
function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    // Este Excel corta las filas con CR solo, no con CRLF ni LF. Los LF que hay
    // son saltos de línea DENTRO de celdas entrecomilladas (ver rama inQuotes).
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (s) =>
  String(s ?? '')
    .replace(/﻿/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Montos con formato argentino: 1.026.317 -> 1026317 ; 1.234,56 -> 1234.56 */
function parseMoney(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  // En la planilla un guion suelto significa "sin monto", no un negativo.
  if (/^-+$/.test(s)) return 0;
  s = s.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!s) return NaN;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // El separador decimal es el que aparece más a la derecha.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    const parts = s.split(',');
    // "1,234" con 3 dígitos después es separador de miles, no decimal.
    s = parts[parts.length - 1].length === 3 && parts[0] !== '0'
      ? s.replace(/,/g, '')
      : s.replace(',', '.');
  } else if (lastDot !== -1) {
    const parts = s.split('.');
    if (parts[parts.length - 1].length === 3 && parts[0] !== '0') s = s.replace(/\./g, '');
  }
  return parseFloat(s);
}

/** Fechas d-m-yyyy o d/m/yyyy (formato argentino: día primero). */
function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const dt = new Date(Date.UTC(year, Number(mo) - 1, Number(d), 12));
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(`${s.slice(0, 10)}T12:00:00Z`).toISOString();
  return null;
}

// ---------------------------------------------------------------- main

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Excel casi nunca exporta UTF-8. Según el sistema puede salir en cp1252
 * (Windows) o Mac Roman (macOS). Si se elige mal, cada acento queda como basura
 * y NINGUNA categoría acentuada matchea ("Salmón", "Carnicería", "Verdulería").
 *
 * En vez de asumir, se prueban las tres y gana la que produzca más letras
 * acentuadas españolas válidas.
 */
const buf = fs.readFileSync(file);
const ACENTOS = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/g;
let raw = '';
let mejor = { enc: null, puntaje: -1 };
for (const enc of ['utf-8', 'windows-1252', 'macintosh']) {
  let texto;
  try { texto = new TextDecoder(enc, { fatal: false }).decode(buf); } catch { continue; }
  const puntaje = (texto.match(ACENTOS) || []).length - (texto.match(/�/g) || []).length * 2;
  if (puntaje > mejor.puntaje) mejor = { enc, puntaje };
}
raw = new TextDecoder(mejor.enc).decode(buf);
console.log(`Codificación detectada: ${mejor.enc}`);
const delimiter = (raw.split('\n')[0].match(/;/g)?.length ?? 0) >
                  (raw.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
const rows = parseCsv(raw, delimiter);

// La hoja tiene filas de encabezado sueltas arriba: se busca la fila real.
const headerIdx = rows.findIndex(
  (r) => r.some((c) => norm(c).startsWith('fecha')) && r.some((c) => norm(c) === 'total')
);
if (headerIdx === -1) {
  console.error('No encontré la fila de encabezados (necesito una con FECHA... y TOTAL).');
  process.exit(1);
}

const header = rows[headerIdx].map(norm);
const col = (...names) => {
  for (const n of names) {
    const i = header.indexOf(norm(n));
    if (i !== -1) return i;
  }
  return -1;
};

const IDX = {
  fecha: col('FECHA PERC.', 'FECHA PERC', 'FECHA'),
  fechaDev: col('FECHA DEV.', 'FECHA DEV'),
  tipo: col('TIPO'),
  categoria: col('CATEGORIA'),
  subcategoria: col('SUBCATEGORIA'),
  detalle: col('DETALLE'),
  billetera: col('BILLETERA'),
  total: col('TOTAL'),
  fiat: col('FIAT'),
};

for (const [k, v] of Object.entries(IDX)) {
  if (v === -1 && !['fechaDev', 'fiat', 'subcategoria'].includes(k)) {
    console.error(`Falta la columna obligatoria: ${k}`);
    process.exit(1);
  }
}

await client.connect();

const { rows: wsRows } = await client.query(
  'select id, user_id from public.workspaces where name = $1', [wsName]
);
if (!wsRows.length) {
  console.error(`No existe el espacio "${wsName}"`);
  process.exit(1);
}
const { id: wsId, user_id: userId } = wsRows[0];

const { rows: cats } = await client.query(
  `select c.id, c.name, c.type, g.name as grupo
     from public.categories c join public.category_groups g on g.id = c.group_id
    where c.workspace_id = $1`, [wsId]
);
const { rows: wallets } = await client.query(
  'select id, name, currency_code from public.wallets where workspace_id = $1', [wsId]
);

const catKey = (grupo, sub, tipo) => `${norm(grupo)}|${norm(sub)}|${tipo}`;
const catMap = new Map(cats.map((c) => [catKey(c.grupo, c.name, c.type), c.id]));
const walletMap = new Map();
for (const w of wallets) {
  walletMap.set(`${norm(w.name)}|${norm(w.currency_code)}`, w.id);
  // Sin moneda: solo sirve si el nombre es único entre monedas.
  const bare = norm(w.name);
  walletMap.set(bare, walletMap.has(bare) ? 'AMBIGUO' : w.id);
}

const FIAT_TO_CODE = { pesos: 'ARS', dolares: 'USD', euros: 'EUR' };

/**
 * Resuelve todas las filas contra las categorías y billeteras que existen ahora.
 * Se corre dos veces cuando hay --create-missing: la primera detecta qué falta,
 * y la segunda ya encuentra todo creado.
 */
function resolverFilas() {
  const ready = [];
  const problems = [];
  const sinMonto = [];
  const faltantes = new Map();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const cell = (idx) => (idx === -1 ? '' : String(r[idx] ?? '').trim());

    const fechaRaw = cell(IDX.fecha);
    const totalRaw = cell(IDX.total);
    if (!fechaRaw && !totalRaw) continue; // fila vacía

    const linea = i + 1;
    const tipoRaw = norm(cell(IDX.tipo));
    const type = tipoRaw === 'ingreso' ? 'income' : tipoRaw === 'egreso' ? 'expense' : null;
    const date = parseDate(fechaRaw);
    const amount = parseMoney(totalRaw);
    const grupo = cell(IDX.categoria);
    const sub = cell(IDX.subcategoria) || 'General';
    const billetera = cell(IDX.billetera);
    const fiat = norm(cell(IDX.fiat));

    // Guion o cero: la fila existe en la planilla pero no mueve plata.
    if (amount === 0) { sinMonto.push(linea); continue; }

    const fails = [];
    if (!type) fails.push(`TIPO ilegible: "${cell(IDX.tipo)}"`);
    if (!date) fails.push(`FECHA ilegible: "${fechaRaw}"`);
    if (!Number.isFinite(amount)) fails.push(`TOTAL ilegible: "${totalRaw}"`);
    if (!grupo) fails.push('Fila sin CATEGORIA');

    let categoryId = null;
    if (type && grupo) {
      categoryId = catMap.get(catKey(grupo, sub, type)) ?? null;
      if (!categoryId) {
        if (CREATE_MISSING) faltantes.set(`${norm(grupo)}|${norm(sub)}|${type}`, { grupo, sub, type });
        else fails.push(`Sin categoría: "${grupo}" > "${sub}" (${type})`);
      }
    }

    const code = FIAT_TO_CODE[fiat];
    let walletId = code
      ? walletMap.get(`${norm(billetera)}|${norm(code)}`)
      : walletMap.get(norm(billetera));
    if (walletId === 'AMBIGUO') {
      fails.push(`Billetera "${billetera}" existe en varias monedas y la fila no trae FIAT`);
      walletId = null;
    }
    if (!walletId) fails.push(`Sin billetera: "${billetera}"${code ? ` (${code})` : ''}`);

    if (fails.length || !categoryId) {
      if (fails.length) problems.push({ linea, fails });
      continue;
    }

    ready.push({
      user_id: userId,
      wallet_id: walletId,
      category_id: categoryId,
      type,
      amount: Math.abs(amount),
      currency_code: code || wallets.find((w) => w.id === walletId).currency_code,
      description: cell(IDX.detalle).replace(/\s+/g, ' ').trim(),
      date,
      invoiced_at: parseDate(cell(IDX.fechaDev)),
      workspace_id: wsId,
    });
  }

  return { ready, problems, sinMonto, faltantes };
}

async function recargarCategorias() {
  const { rows: cs } = await client.query(
    `select c.id, c.name, c.type, g.name as grupo
       from public.categories c join public.category_groups g on g.id = c.group_id
      where c.workspace_id = $1`, [wsId]
  );
  catMap.clear();
  for (const c of cs) catMap.set(catKey(c.grupo, c.name, c.type), c.id);
}

let { ready, problems, sinMonto, faltantes } = resolverFilas();

// ---------------------------------------------------------------- faltantes

if (faltantes.size) {
  console.log(`\nCategorías que faltan y hay que crear: ${faltantes.size}`);
  for (const { grupo, sub, type } of [...faltantes.values()].sort((a, b) =>
    a.grupo.localeCompare(b.grupo) || a.sub.localeCompare(b.sub)
  )) {
    console.log(`  ${grupo} > ${sub}  (${type === 'income' ? 'ingreso' : 'egreso'})`);
  }

  if (APPLY) {
    await client.query('begin');
    try {
      for (const { grupo, sub, type } of faltantes.values()) {
        let { rows: g } = await client.query(
          'select id from public.category_groups where workspace_id = $1 and name = $2', [wsId, grupo]
        );
        if (!g.length) {
          ({ rows: g } = await client.query(
            `insert into public.category_groups (user_id, name, is_system, workspace_id)
             values ($1,$2,false,$3) returning id`, [userId, grupo, wsId]
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

    await recargarCategorias();
    ({ ready, problems, sinMonto } = resolverFilas());
  }
}

// ---------------------------------------------------------------- informe

console.log(`\nEspacio: ${wsName}`);
console.log(`  Listas para cargar : ${ready.length}`);
console.log(`  Sin monto (saltadas): ${sinMonto.length}`);
console.log(`  Con problemas       : ${problems.length}`);

if (problems.length) {
  const byReason = new Map();
  for (const p of problems) {
    for (const f of p.fails) {
      if (!byReason.has(f)) byReason.set(f, []);
      byReason.get(f).push(p.linea);
    }
  }
  console.log('\n--- Motivos ---');
  for (const [reason, lines] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(lines.length).padStart(4)}x  ${reason}`);
    console.log(`        líneas: ${lines.slice(0, 10).join(', ')}${lines.length > 10 ? '…' : ''}`);
  }
}

if (!APPLY) {
  console.log('\nSIMULACRO: no se escribió nada. Agregá --apply para cargar de verdad.\n');
  await client.end();
  process.exit(0);
}

if (!ready.length) {
  console.log('\nNo hay nada para cargar.\n');
  await client.end();
  process.exit(0);
}

const batch = `xls-${new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '')}`;
await client.query('begin');
try {
  for (const t of ready) {
    await client.query(
      `insert into public.transactions
         (user_id, wallet_id, category_id, type, amount, currency_code, description,
          date, invoiced_at, import_batch, is_checkpoint, status, workspace_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,'draft',$11)`,
      [t.user_id, t.wallet_id, t.category_id, t.type, t.amount, t.currency_code,
       t.description, t.date, t.invoiced_at, batch, t.workspace_id]
    );
  }
  await client.query('commit');
  console.log(`\nCargados ${ready.length} movimientos. import_batch = ${batch}`);
  console.log(`Revertir:  node scripts/db.mjs -c "delete from transactions where import_batch='${batch}'"\n`);
} catch (e) {
  await client.query('rollback');
  console.error('\nERROR, no se cargó nada:', e.message, '\n');
  process.exitCode = 1;
}

await client.end();
