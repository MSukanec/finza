/**
 * SQL runner - acceso directo a la base de Supabase.
 * ==================================================
 * Usa DATABASE_URL de .env.local (rol `postgres`: lee, escribe, DDL, ignora RLS).
 *
 * Uso:
 *   node scripts/db.mjs -c "select * from wallets limit 5"
 *   node scripts/db.mjs -f DB/012_workspaces.sql
 *   echo "select now()" | node scripts/db.mjs
 *
 * Flags:
 *   --json   salida como JSON en vez de tabla
 *   --tx     envuelve todo en una transaccion (rollback automatico si algo falla)
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local'), quiet: true });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL no encontrado en .env.local');
  process.exit(1);
}

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const useTx = argv.includes('--tx');

function readSql() {
  const ci = argv.indexOf('-c');
  if (ci !== -1 && argv[ci + 1]) return argv[ci + 1];
  const fi = argv.indexOf('-f');
  if (fi !== -1 && argv[fi + 1]) return fs.readFileSync(argv[fi + 1], 'utf8');
  if (!process.stdin.isTTY) return fs.readFileSync(0, 'utf8');
  return null;
}

const sql = readSql();
if (!sql || !sql.trim()) {
  console.error('Nada para ejecutar. Usá -c "SQL", -f archivo.sql, o pipe por stdin.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 60000,
});

function render(res) {
  const results = Array.isArray(res) ? res : [res];
  for (const r of results) {
    if (r.command && !r.rows?.length) {
      console.log(`${r.command} -> ${r.rowCount ?? 0} fila(s)`);
      continue;
    }
    if (!r.rows?.length) continue;
    if (asJson) console.log(JSON.stringify(r.rows, null, 2));
    else console.table(r.rows);
    console.log(`(${r.rows.length} fila(s))`);
  }
}

try {
  await client.connect();
  if (useTx) await client.query('begin');
  const res = await client.query(sql);
  if (useTx) await client.query('commit');
  render(res);
} catch (err) {
  if (useTx) { try { await client.query('rollback'); console.error('-- rollback --'); } catch {} }
  console.error(`ERROR ${err.code ?? ''}: ${err.message}`);
  if (err.position) console.error(`  posicion: ${err.position}`);
  if (err.detail) console.error(`  detalle: ${err.detail}`);
  if (err.hint) console.error(`  hint: ${err.hint}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
