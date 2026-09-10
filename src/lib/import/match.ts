/**
 * Emparejar texto de planilla contra lo que ya existe en el espacio.
 *
 * El importador anterior daba por bueno cualquier par que compartiera los
 * primeros 4 caracteres. Con esa regla "Comidas" matcheaba con "Comisiones" y
 * la fila quedaba categorizada mal, en silencio y sin forma de notarlo. Acá la
 * cercanía se mide de verdad y, cuando no alcanza para decidir sola, se
 * devuelve como sugerencia para que la confirme una persona.
 */

import { clave, normalizar } from './values';

export type Confianza = 'exacta' | 'alta' | 'sugerida';

export interface Emparejamiento<T> {
  item: T;
  puntaje: number;
  confianza: Confianza;
}

/** A partir de acá se aplica solo; por debajo se ofrece como sugerencia. */
const UMBRAL_AUTO = 0.86;
/** Por debajo de esto no se muestra nada: es ruido, no una sugerencia. */
const UMBRAL_SUGERENCIA = 0.68;
/** Textos más cortos que esto no se comparan por distancia: todo se parece. */
const LARGO_MINIMO = 5;

/** Distancia de edición clásica, con una sola fila de memoria. */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(actual[j - 1] + 1, previa[j] + 1, previa[j - 1] + costo);
    }
    previa = actual;
  }
  return previa[b.length];
}

/** Cercanía entre dos textos, de 0 (nada que ver) a 1 (idénticos). */
export function similitud(a: string, b: string): number {
  const x = normalizar(a);
  const y = normalizar(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - distancia(x, y) / Math.max(x.length, y.length);
}

/** Palabras significativas de un texto, sin conectores. */
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'a', 'en', 'por', 'para']);
function palabras(texto: string): Set<string> {
  return new Set(
    normalizar(texto)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length > 1 && !VACIAS.has(p))
  );
}

function mismoConjunto(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || a.size !== b.size) return false;
  for (const p of a) if (!b.has(p)) return false;
  return true;
}

/**
 * El mejor candidato para un texto, o `null` si ninguno se acerca lo suficiente.
 *
 * `confianza` dice qué hacer con el resultado: `exacta` y `alta` se pueden
 * aplicar sin preguntar; `sugerida` tiene que pasar por el ojo de alguien.
 */
export function emparejar<T>(
  consulta: string,
  candidatos: readonly T[],
  texto: (c: T) => string
): Emparejamiento<T> | null {
  const q = normalizar(consulta);
  if (!q || candidatos.length === 0) return null;

  const qClave = clave(consulta);
  const qPalabras = palabras(consulta);

  let mejor: Emparejamiento<T> | null = null;

  for (const item of candidatos) {
    const t = texto(item);
    if (!t) continue;

    // Idénticos salvo acentos, mayúsculas o puntuación.
    if (clave(t) === qClave) return { item, puntaje: 1, confianza: 'exacta' };

    // Mismas palabras en otro orden: "Artículos de limpieza" / "Limpieza artículos".
    if (mismoConjunto(qPalabras, palabras(t))) {
      const cand: Emparejamiento<T> = { item, puntaje: 0.97, confianza: 'alta' };
      if (!mejor || cand.puntaje > mejor.puntaje) mejor = cand;
      continue;
    }

    if (q.length < LARGO_MINIMO || normalizar(t).length < LARGO_MINIMO) continue;

    const puntaje = similitud(consulta, t);
    if (puntaje < UMBRAL_SUGERENCIA) continue;

    const cand: Emparejamiento<T> = {
      item,
      puntaje,
      confianza: puntaje >= UMBRAL_AUTO ? 'alta' : 'sugerida',
    };
    if (!mejor || cand.puntaje > mejor.puntaje) mejor = cand;
  }

  return mejor;
}
