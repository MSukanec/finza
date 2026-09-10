/**
 * Reconocimiento de columnas: de los encabezados que trae la planilla a los
 * campos que entiende la app.
 */

import { clave } from './values';

export type Campo =
  | 'fecha'
  | 'fechaFacturado'
  | 'tipo'
  | 'categoria'
  | 'subcategoria'
  | 'detalle'
  | 'moneda'
  | 'billetera'
  | 'total'
  | 'nombre'
  | 'apellido'
  | 'facturado';

/**
 * Nombres aceptados por campo. Se comparan con `clave()`, así que acentos,
 * mayúsculas, espacios y el punto de "FECHA PERC." dan igual.
 *
 * `fecha` incluye "FECHA PERC." (percibido) porque es la que trae la planilla
 * real: el importador viejo sólo conocía "FECHA" y, al no encontrarla, fechaba
 * cada fila con el día de la importación.
 */
const ALIAS: Record<Campo, string[]> = {
  fecha: ['fechaperc', 'fechapercibido', 'fecha', 'fechaoperacion', 'fechamovimiento', 'date'],
  fechaFacturado: ['fechadev', 'fechadevengado', 'fechafacturacion', 'fechafactura'],
  tipo: ['tipo', 'tipomovimiento', 'tipodemovimiento'],
  categoria: ['categoria', 'rubro'],
  subcategoria: ['subcategoria', 'subrubro'],
  detalle: ['detalle', 'descripcion', 'concepto', 'referencia', 'description'],
  moneda: ['fiat', 'moneda', 'divisa'],
  billetera: ['billetera', 'cuenta', 'medio', 'mediodepago', 'wallet'],
  total: ['total', 'monto', 'importe', 'valor', 'amount'],
  nombre: ['nombre'],
  apellido: ['apellido'],
  facturado: ['facturado', 'facturada'],
};

/** Campos sin los cuales no hay nada que importar. */
const OBLIGATORIOS: Campo[] = ['fecha', 'total'];

export type Columnas = Partial<Record<Campo, number>>;

function mapearFila(fila: string[]): Columnas {
  const cols: Columnas = {};
  fila.forEach((celda, i) => {
    const k = clave(celda);
    if (!k) return;
    for (const [campo, alias] of Object.entries(ALIAS) as [Campo, string[]][]) {
      // El primer encabezado que gana se queda con la columna: si la planilla
      // repite "FECHA", la de más a la izquierda es la buena.
      if (cols[campo] === undefined && alias.includes(k)) cols[campo] = i;
    }
  });
  return cols;
}

export interface Encabezado {
  fila: number;
  columnas: Columnas;
}

/**
 * Busca la fila de encabezados en vez de asumir que es la primera.
 *
 * Estas planillas arrancan con filas sueltas de título, logo o totales, así que
 * se prueban las primeras y gana la que reconozca más columnas, siempre que
 * tenga fecha y total.
 */
export function detectarEncabezado(filas: string[][], maxFilas = 30): Encabezado | null {
  let mejor: Encabezado | null = null;
  let mejorPuntaje = 0;

  for (let i = 0; i < Math.min(filas.length, maxFilas); i++) {
    const columnas = mapearFila(filas[i]);
    if (!OBLIGATORIOS.every((c) => columnas[c] !== undefined)) continue;

    const puntaje = Object.keys(columnas).length;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = { fila: i, columnas };
    }
  }

  return mejor;
}

/** Los campos obligatorios que la planilla no trae. */
export function camposFaltantes(columnas: Columnas): Campo[] {
  return OBLIGATORIOS.filter((c) => columnas[c] === undefined);
}
