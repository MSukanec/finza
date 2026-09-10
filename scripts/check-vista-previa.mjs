// La vista previa de rol tiene que mostrar EXACTAMENTE lo mismo que vería esa
// persona de verdad. Si el recorte del cliente se desincroniza de las políticas
// de la base, la pantalla miente — y miente en la dirección peligrosa: dice
// "esto no lo ve" sobre algo que sí ve.
//
// Este script no compara contra lo que yo creo que hace la base: cambia el rol
// de verdad, corre las mismas consultas y compara. Todo dentro de una
// transacción que se revierte.
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WS = '06a79300-cec3-49b1-841b-de5a032754f5';
const USUARIO = '5c419d3a-a015-4822-9e2e-443e6d374912';
const AUTH = '4296fd70-207e-4aac-a7d5-d61bb33ae774';

const sql = `
BEGIN;
CREATE TEMP TABLE r(tabla text, real_ int, cliente int) ON COMMIT DROP;
GRANT ALL ON r TO authenticated;

-- Rol cambiado DE VERDAD: esto es lo que ve un colaborador real.
UPDATE workspace_members SET role='collaborator'
 WHERE workspace_id='${WS}' AND user_id='${USUARIO}';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"${AUTH}","role":"authenticated"}', true);

INSERT INTO r
SELECT 'transactions', (SELECT count(*) FROM transactions WHERE workspace_id='${WS}' AND deleted_at IS NULL), NULL::int
UNION ALL SELECT 'wallets',    (SELECT count(*) FROM wallets    WHERE workspace_id='${WS}' AND deleted_at IS NULL), NULL::int
UNION ALL SELECT 'partners',   (SELECT count(*) FROM partners   WHERE workspace_id='${WS}' AND deleted_at IS NULL), NULL::int
UNION ALL SELECT 'debts',      (SELECT count(*) FROM debts      WHERE workspace_id='${WS}' AND deleted_at IS NULL), NULL::int
UNION ALL SELECT 'budgets',    (SELECT count(*) FROM budgets    WHERE workspace_id='${WS}' AND deleted_at IS NULL), NULL::int
UNION ALL SELECT 'reconciliations', (SELECT count(*) FROM wallet_reconciliations WHERE workspace_id='${WS}' AND deleted_at IS NULL), NULL::int
UNION ALL SELECT 'categories', (SELECT count(*) FROM categories WHERE workspace_id='${WS}' AND deleted_at IS NULL), NULL::int;

RESET ROLE;
SELECT tabla, real_ FROM r ORDER BY tabla;
ROLLBACK;
`;

const archivo = join(tmpdir(), `vista-previa-${Date.now()}.sql`);
writeFileSync(archivo, sql, 'utf8');

let salida;
try {
  salida = execFileSync('node', ['scripts/db.mjs', '-f', archivo, '--json'], { encoding: 'utf8' });
} finally {
  unlinkSync(archivo);
}

const real = Object.fromEntries(
  JSON.parse(salida.slice(salida.lastIndexOf('['), salida.lastIndexOf(']') + 1)).map((f) => [
    f.tabla,
    Number(f.real_),
  ])
);

// Lo que produce el recorte del cliente para el mismo rol.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon';
const { recorteDeVistaPrevia } = await import('../src/stores/finance-store.ts');
const recorte = recorteDeVistaPrevia('collaborator');

// El colaborador real no tiene movimientos propios en Samurai: todos son de
// Ariel. Así que el recorte del cliente tiene que dejar 0.
const cliente = {
  transactions: recorte.soloLoMio ? 0 : real.transactions,
  wallets: recorte.sinPatrimonio ? 0 : real.wallets,
  partners: recorte.sinPatrimonio ? 0 : real.partners,
  debts: recorte.sinPatrimonio ? 0 : real.debts,
  budgets: recorte.sinPatrimonio ? 0 : real.budgets,
  reconciliations: recorte.sinPatrimonio ? 0 : real.reconciliations,
};

let fallas = 0;
for (const [tabla, esperado] of Object.entries(cliente)) {
  const obtenido = real[tabla] ?? 0;
  if (obtenido === esperado) {
    console.log(`OK   ${tabla}: la base le da ${obtenido}, la vista previa muestra ${esperado}`);
  } else {
    fallas++;
    console.log(
      `FALLA ${tabla}: la base le da ${obtenido} pero la vista previa mostraría ${esperado}`
    );
  }
}

// Las categorías NO se recortan: el colaborador las necesita para clasificar.
if (real.categories > 0) {
  console.log(`OK   categories: ${real.categories}, no se recortan (las necesita para cargar)`);
} else {
  fallas++;
  console.log('FALLA categories: un colaborador sin categorías no puede cargar nada');
}

process.exit(fallas === 0 ? 0 : 1);
