/**
 * Verifica que la huella calculada en TypeScript y la calculada en la base den
 * exactamente lo mismo, contra los movimientos reales del espacio.
 *
 *   node scripts/check-huellas.mjs        (o: npm run check:huellas)
 *
 * Por qué existe: la columna `fingerprint` la llena un trigger
 * (DB/029_huellas_y_lotes.sql) y el importador compara contra ella usando
 * `huella()` de src/lib/import. Son dos implementaciones de la misma
 * definición, en dos lenguajes. Si se separan, el importador deja de reconocer
 * lo que ya está cargado y vuelve a duplicar todo — en silencio, que es la peor
 * forma. Este script es el único que ata las dos.
 *
 * Necesita DATABASE_URL. Si no hay base a mano, sale sin fallar.
 */

import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
register('./tsx-loader.mjs', pathToFileURL(path.join(__dirname, '/')));
const { huella } = await import('../src/lib/import/index.ts');

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local'), quiet: true });

if (!process.env.DATABASE_URL) {
  console.log('Sin DATABASE_URL: no hay base contra la cual comparar. Salteado.');
  process.exit(0);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(`
  select id, wallet_id, date, amount, type::text as type, description, fingerprint
    from public.transactions
   where fingerprint is not null
   order by created_at desc`);

let distintas = 0;
const ejemplos = [];

for (const t of rows) {
  const propia = huella({
    fecha: new Date(t.date).toISOString(),
    monto: Number(t.amount),
    walletId: t.wallet_id,
    tipo: t.type,
    detalle: t.description,
  });
  if (propia !== t.fingerprint) {
    distintas++;
    if (ejemplos.length < 5) ejemplos.push({ id: t.id, base: t.fingerprint, ts: propia });
  }
}

console.log(`Comparadas ${rows.length} filas.`);

if (distintas === 0) {
  console.log('OK    TypeScript y la base calculan la misma huella.');
  await client.end();
  process.exit(0);
}

console.log(`FALLA ${distintas} huellas no coinciden. La definición se separó.`);
for (const e of ejemplos) {
  console.log(`\n  ${e.id}`);
  console.log(`    base: ${e.base}`);
  console.log(`    ts  : ${e.ts}`);
}
console.log('\nRevisar `transaction_fingerprint` en DB/029 y `huella()` en src/lib/import/index.ts.');

await client.end();
process.exit(1);
