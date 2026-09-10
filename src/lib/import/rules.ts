/**
 * Reglas de mapeo aprendidas.
 *
 * El emparejamiento por parecido (`match.ts`) resuelve lo obvio. Esto resuelve
 * lo que NO es obvio y sólo una persona puede saber: que "MERPAGO*UBER" es
 * Transporte, que "Efvo" es la billetera Efectivo. Se aprende una vez, en la
 * pantalla de importar, y desde entonces esa fila deja de preguntar.
 *
 * La tabla y el upsert están en DB/030_reglas_de_importacion.sql. Acá vive
 * únicamente cómo se elige qué regla gana.
 */

import type { Movimiento } from './index';
import { normalizar } from './values';

export type CampoRegla = 'categoria' | 'detalle' | 'billetera';
export type TipoCoincidencia = 'exact' | 'contains';

export interface Regla {
  id: string;
  field: CampoRegla;
  /** Origen al que aplica; `null` vale para cualquiera. */
  source: string | null;
  matchType: TipoCoincidencia;
  /** Ya normalizado, tal como lo guarda la base. */
  pattern: string;
  type: 'income' | 'expense' | null;
  categoryId: string | null;
  walletId: string | null;
  hits: number;
}

/**
 * El texto de la fila que mira cada tipo de regla.
 *
 * `categoria` junta grupo y categoría con una barra: una regla sobre
 * "Comidas|Salmón" no debe dispararse con "Bebidas|Salmón", que es otra cosa.
 */
export function textoParaRegla(m: Movimiento, field: CampoRegla): string {
  switch (field) {
    case 'categoria':
      return `${m.grupo}|${m.categoria}`;
    case 'detalle':
      return m.detalle;
    case 'billetera':
      return m.billetera;
  }
}

/**
 * La regla que gana para una fila, o `null` si ninguna aplica.
 *
 * El orden importa y no es arbitrario:
 *
 * 1. Una regla con `source` le gana a una general. "Cuota" significa una cosa
 *    en el resumen de la tarjeta y otra en la planilla del negocio.
 * 2. `exact` le gana a `contains`. Un texto que coincide entero es una
 *    afirmación más fuerte que uno que aparece adentro.
 * 3. Entre varias `contains`, gana el patrón más largo: "uber eats" es más
 *    específico que "uber" y no tiene sentido que pierda por orden de carga.
 * 4. A igualdad de todo, la que más se usó.
 */
export function buscarRegla(
  m: Movimiento,
  reglas: readonly Regla[],
  field: CampoRegla,
  source: string | null = null
): Regla | null {
  const texto = normalizar(textoParaRegla(m, field));
  if (!texto) return null;

  const aplica = (r: Regla) => {
    if (r.field !== field) return false;
    if (r.source !== null && r.source !== source) return false;
    // Una regla de categoría atada a un tipo no cruza de ingreso a gasto.
    if (r.type !== null && r.type !== m.tipo) return false;
    return r.matchType === 'exact' ? r.pattern === texto : texto.includes(r.pattern);
  };

  const peso = (r: Regla) => [
    r.source !== null ? 1 : 0,
    r.matchType === 'exact' ? 1 : 0,
    r.pattern.length,
    r.hits,
  ];

  let mejor: Regla | null = null;
  for (const r of reglas) {
    if (!aplica(r)) continue;
    if (!mejor) {
      mejor = r;
      continue;
    }
    const a = peso(r);
    const b = peso(mejor);
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (a[i] > b[i]) mejor = r;
      break;
    }
  }

  return mejor;
}

/** Traduce una fila de `import_rules` a la forma que usa el motor. */
export function reglaDesdeFila(fila: Record<string, unknown>): Regla {
  return {
    id: String(fila.id),
    field: fila.field as CampoRegla,
    source: (fila.source as string | null) ?? null,
    matchType: (fila.match_type as TipoCoincidencia) ?? 'exact',
    pattern: String(fila.pattern ?? ''),
    type: (fila.type as 'income' | 'expense' | null) ?? null,
    categoryId: (fila.category_id as string | null) ?? null,
    walletId: (fila.wallet_id as string | null) ?? null,
    hits: Number(fila.hits ?? 0),
  };
}
