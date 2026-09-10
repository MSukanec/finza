/**
 * Motor de importación compartido entre la app y los scripts.
 *
 * Antes esta lógica estaba escrita dos veces —una en la vista de importar y
 * otra en `scripts/import-movimientos.mjs`— y las dos versiones se fueron
 * separando: la del script aprendió a detectar codificación, a leer CR suelto
 * y a encontrar la fila de encabezados, y la de la app se quedó atrás. Ahora
 * las dos entran por acá.
 */

import { detectarEncabezado, camposFaltantes, type Campo, type Columnas } from './columns';
import { decodificar, detectarDelimitador, parsearDelimitado } from './text';
import { clave, diaDe, leerFecha, leerMoneda, leerMonto, leerTipo, normalizar } from './values';

export * from './columns';
export * from './match';
export * from './pdf';
export * from './rules';
export * from './visa';
export * from './text';
export * from './values';

/** La categoría con la que la planilla marca los pases entre billeteras. */
const MARCA_TRANSFERENCIA = 'movimientos';

export interface Planilla {
  codificacion: string;
  delimitador: string;
  filaEncabezado: number;
  columnas: Columnas;
  /** Filas de datos, crudas, tal como venían debajo del encabezado. */
  filas: string[][];
}

export class ErrorDePlanilla extends Error {}

/** Abre el archivo y deja las filas listas para interpretar. */
export function leerPlanilla(buffer: ArrayBuffer | Uint8Array): Planilla {
  const { texto, codificacion } = decodificar(buffer);
  if (!texto.trim()) throw new ErrorDePlanilla('El archivo está vacío.');

  const delimitador = detectarDelimitador(texto);
  const todas = parsearDelimitado(texto, delimitador);

  const encabezado = detectarEncabezado(todas);
  if (!encabezado) {
    throw new ErrorDePlanilla(
      'No encontré la fila de encabezados. Hace falta al menos una columna de fecha y una de total.'
    );
  }

  const faltantes = camposFaltantes(encabezado.columnas);
  if (faltantes.length) {
    throw new ErrorDePlanilla(`Faltan columnas obligatorias: ${faltantes.join(', ')}.`);
  }

  return {
    codificacion,
    delimitador,
    filaEncabezado: encabezado.fila,
    columnas: encabezado.columnas,
    filas: todas.slice(encabezado.fila + 1),
  };
}

export type MotivoDescarte = 'sinMonto' | 'ilegible';

export interface Movimiento {
  /** Número de línea en el archivo, para poder señalar el problema. */
  linea: number;
  fecha: string;
  fechaFacturado: string | null;
  tipo: 'income' | 'expense';
  /** Grupo de la categoría, ya resuelto contra el par CATEGORIA/SUBCATEGORIA. */
  grupo: string;
  categoria: string;
  detalle: string;
  moneda: string | null;
  billetera: string;
  monto: number;
  /** La fila es un pase entre billeteras propias, no un ingreso ni un gasto. */
  esTransferencia: boolean;
  /**
   * El comercio, cuando el origen no trae categorías y hay que deducirlas del
   * texto: es el caso de los resúmenes de tarjeta. Cuando está, es la clave por
   * la que se agrupan las filas y se aprenden las reglas.
   */
  comercio?: string;
}

export interface Descartada {
  linea: number;
  motivo: MotivoDescarte;
  problemas: string[];
}

export interface Interpretacion {
  movimientos: Movimiento[];
  descartadas: Descartada[];
}

/**
 * Convierte las filas crudas en movimientos, separando las que no se pueden
 * leer en vez de cargarlas a medias.
 *
 * La regla de categorías es la que ya está en la base: CATEGORIA es siempre el
 * grupo, y SUBCATEGORIA la categoría. Cuando la planilla no trae subcategoría,
 * la categoría se llama "General" DENTRO de ese grupo — así está cargado
 * "Delivery + Takeaway › General", y así el grupo puede ganar subcategorías más
 * adelante sin mover nada. La vista de importar hacía lo contrario y por eso
 * ninguna de esas filas reencontraba su categoría.
 */
export function interpretar(planilla: Planilla): Interpretacion {
  const movimientos: Movimiento[] = [];
  const descartadas: Descartada[] = [];
  const celda = (fila: string[], campo: Campo): string => {
    const i = planilla.columnas[campo];
    return i === undefined ? '' : String(fila[i] ?? '').trim();
  };

  planilla.filas.forEach((fila, idx) => {
    const linea = planilla.filaEncabezado + 2 + idx;

    const fechaBruta = celda(fila, 'fecha');
    const totalBruto = celda(fila, 'total');
    if (!fechaBruta && !totalBruto) return; // fila vacía

    const monto = leerMonto(totalBruto);
    // Guion suelto o celda vacía: la fila existe en la planilla pero no mueve
    // plata. No es un error, es una fila que no corresponde importar.
    if (monto === null || monto === 0) {
      descartadas.push({ linea, motivo: 'sinMonto', problemas: [] });
      return;
    }

    const problemas: string[] = [];
    const fecha = leerFecha(fechaBruta);
    if (!fecha) problemas.push(`Fecha ilegible: "${fechaBruta}"`);

    const tipo = leerTipo(celda(fila, 'tipo'));
    if (!tipo) problemas.push(`Tipo ilegible: "${celda(fila, 'tipo')}"`);

    let categoria = celda(fila, 'categoria');
    let subcategoria = celda(fila, 'subcategoria');
    // Si sólo vino la subcategoría, es el nombre de la categoría.
    if (!categoria && subcategoria) {
      categoria = subcategoria;
      subcategoria = '';
    }

    const esTransferencia = clave(categoria) === MARCA_TRANSFERENCIA;
    if (!categoria && !esTransferencia) problemas.push('Fila sin categoría');

    if (problemas.length || !fecha || !tipo) {
      descartadas.push({ linea, motivo: 'ilegible', problemas });
      return;
    }

    let detalle = celda(fila, 'detalle').replace(/\s+/g, ' ').trim();
    const persona = `${celda(fila, 'nombre')} ${celda(fila, 'apellido')}`.trim();
    if (persona) detalle = `[${persona}] ${detalle}`.trim();

    const facturado = clave(celda(fila, 'facturado'));

    movimientos.push({
      linea,
      fecha,
      fechaFacturado: leerFecha(celda(fila, 'fechaFacturado')) ?? (facturado === 'x' ? fecha : null),
      tipo,
      grupo: categoria,
      categoria: subcategoria || 'General',
      detalle,
      moneda: leerMoneda(celda(fila, 'moneda')),
      billetera: celda(fila, 'billetera'),
      monto: Math.abs(monto),
      esTransferencia,
    });
  });

  return { movimientos, descartadas };
}

export interface Transferencia {
  salida: Movimiento;
  entrada: Movimiento;
  /** Días de diferencia entre las dos patas; 0 si cayeron el mismo día. */
  desfase: number;
}

export interface ResultadoTransferencias {
  pares: Transferencia[];
  huerfanos: Movimiento[];
}

const DIA_MS = 86_400_000;
/** Un pase puede quedar registrado con un par de días de diferencia. */
const DESFASE_MAXIMO = 3;

/**
 * Arma los pares de transferencias entre las filas marcadas como movimientos.
 *
 * El emparejamiento anterior comparaba la fecha como texto y aceptaba montos
 * que difirieran hasta en 2, sin mirar la billetera: con esas reglas dos pases
 * parecidos del mismo día se cruzaban entre sí. Acá el monto tiene que
 * coincidir al centavo y las billeteras tienen que ser distintas —una
 * transferencia a la misma billetera no existe— y a cambio se tolera un desfase
 * de días, que es lo que pasa cuando la plata sale un viernes y entra un lunes.
 *
 * Lo que esto NO arregla: una fila marcada como pase que en el archivo nunca
 * tuvo contrapata. Esas salen como huérfanas y es correcto que salgan.
 */
export function emparejarTransferencias(
  movimientos: readonly Movimiento[]
): ResultadoTransferencias {
  const candidatos = movimientos.filter((m) => m.esTransferencia);
  const pares: Transferencia[] = [];
  const usados = new Set<Movimiento>();

  const mismaBilletera = (a: Movimiento, b: Movimiento) =>
    clave(a.billetera) === clave(b.billetera);
  const dias = (a: Movimiento, b: Movimiento) =>
    Math.round(Math.abs(Date.parse(a.fecha) - Date.parse(b.fecha)) / DIA_MS);

  // Dos vueltas: primero las que caen el mismo día, y sólo después se afloja la
  // fecha. Así un pase exacto nunca pierde su pareja contra otro más lejano.
  for (const desfaseMax of [0, DESFASE_MAXIMO]) {
    for (const salida of candidatos) {
      if (salida.tipo !== 'expense' || usados.has(salida)) continue;

      let elegida: Movimiento | null = null;
      let mejorDesfase = Infinity;

      for (const entrada of candidatos) {
        if (entrada.tipo !== 'income' || usados.has(entrada)) continue;
        if (entrada.monto !== salida.monto) continue;
        if (mismaBilletera(salida, entrada)) continue;
        const d = dias(salida, entrada);
        if (d > desfaseMax) continue;
        if (d < mejorDesfase) {
          mejorDesfase = d;
          elegida = entrada;
        }
      }

      if (elegida) {
        usados.add(salida);
        usados.add(elegida);
        pares.push({ salida, entrada: elegida, desfase: mejorDesfase });
      }
    }
  }

  return { pares, huerfanos: candidatos.filter((m) => !usados.has(m)) };
}

/**
 * Huella de una fila DENTRO de un archivo, para detectar repetidas antes de
 * saber a qué billetera va cada una.
 *
 * Usa el texto crudo de la billetera porque en esta etapa todavía no hay id.
 * Para comparar contra lo que ya está en la base es la otra, `huella()`.
 */
export function huellaArchivo(
  m: Pick<Movimiento, 'fecha' | 'monto' | 'billetera' | 'detalle' | 'tipo'>
): string {
  return [diaDe(m.fecha), m.monto.toFixed(2), clave(m.billetera), m.tipo, normalizar(m.detalle)].join('|');
}

/**
 * Identidad de un movimiento en el mundo real, con independencia del archivo
 * del que vino.
 *
 * ESTA FUNCIÓN ES UN ESPEJO de `transaction_fingerprint` en la base
 * (DB/029_huellas_y_lotes.sql), que es la que efectivamente llena la columna
 * `fingerprint` vía trigger. Si las dos se separan, el importador deja de
 * reconocer lo que ya está cargado y vuelve a duplicar todo.
 * `npm run check:huellas` compara las dos contra filas reales.
 *
 * Va la billetera por ID y no por nombre: renombrar "Efectivo" a "Caja" dejaría
 * las huellas guardadas apuntando al nombre viejo.
 */
export function huella(m: {
  fecha: string;
  monto: number;
  walletId: string | null;
  tipo: string;
  detalle: string | null;
}): string {
  return [
    diaDe(m.fecha),
    Math.abs(m.monto).toFixed(2),
    m.walletId ?? '',
    m.tipo,
    normalizar(m.detalle),
  ].join('|');
}

/** Marca las filas repetidas dentro del mismo archivo. */
export function marcarRepetidas(movimientos: readonly Movimiento[]): Map<Movimiento, string> {
  const vistas = new Set<string>();
  const repetidas = new Map<Movimiento, string>();
  for (const m of movimientos) {
    const h = huellaArchivo(m);
    if (vistas.has(h)) repetidas.set(m, h);
    else vistas.add(h);
  }
  return repetidas;
}
