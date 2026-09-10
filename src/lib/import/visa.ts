/**
 * Adaptador del resumen de tarjeta Visa (Banco Galicia).
 *
 * Convierte el PDF en los mismos `Movimiento` que produce una planilla, así
 * todo lo que ya existe —reglas aprendidas, deduplicación, la pantalla de
 * revisión— funciona sin enterarse de que el archivo era otra cosa.
 *
 * Cómo se modela la tarjeta, que es lo que decide si los números cierran:
 *
 * - La tarjeta ES una billetera. Cada consumo es un gasto que sale de ahí y su
 *   saldo es lo que se debe. Las devoluciones entran como ingreso.
 * - Hay una billetera por moneda: el resumen mezcla pesos y dólares en la misma
 *   tabla, y en Finza cada billetera tiene una sola moneda.
 * - De una compra en cuotas se importa SÓLO la cuota del mes. Es lo que
 *   realmente sale del bolsillo este mes; las que siguen entran cuando llegue
 *   cada resumen.
 * - El pago del resumen NO se importa: es una transferencia desde el banco, y
 *   de qué cuenta salió no está en este archivo. Se informa aparte para que
 *   nadie crea que se perdió.
 */

import type { Movimiento } from './index';
import { leerFecha, leerMonto } from './values';
import { agruparEnLineas, type FragmentoPdf, type PaginaPdf } from './pdf';

/**
 * Dónde empieza cada columna. Salen de las posiciones reales del PDF, que el
 * mainframe emite siempre iguales: fecha en 23, referencia en 86, cuota en 320,
 * comprobante en 365, pesos en 455-467 y dólares de 542 en adelante.
 */
const COLUMNA = {
  fecha: 60,
  marca: 80,
  referencia: 300,
  cuota: 350,
  comprobante: 420,
  pesos: 520,
} as const;

export type ClaseFila = 'consumo' | 'impuesto' | 'pago' | 'saldo';

export interface FilaResumen {
  /** Posición dentro del resumen, para poder señalar la fila al informar. */
  indice: number;
  fecha: string;
  /** El nombre del comercio, sin la referencia. Es la clave para las reglas. */
  comercio: string;
  /** El texto completo tal como lo imprime el resumen. */
  detalle: string;
  comprobante: string;
  /** "04/12" cuando la compra viene en cuotas. */
  cuota: string | null;
  monto: number;
  moneda: 'ARS' | 'USD';
  /** -1 en devoluciones y pagos, que restan de lo que se debe. */
  signo: 1 | -1;
  tarjeta: string | null;
  clase: ClaseFila;
}

export interface Resumen {
  filas: FilaResumen[];
  totalArs: number | null;
  totalUsd: number | null;
  /** Tarjetas que aparecen en el resumen, con su titular. */
  tarjetas: { numero: string; titular: string }[];
}

const PATRON_IMPUESTO =
  /IMPUESTO|IVA|IIBB|PERCEPCION|INTERESES|DB\.RG|DEV\.IMP|SELLOS|COMISION|RENOVACION|MANTENIMIENTO/i;

/** Reconoce el resumen por su encabezado, antes de intentar leerlo. */
export function esResumenVisa(paginas: PaginaPdf[]): boolean {
  const texto = paginas
    .slice(0, 2)
    .flatMap((p) => p.fragmentos.map((f) => f.texto))
    .join(' ');
  return /DETALLE DEL CONSUMO/i.test(texto) && /VISA/i.test(texto);
}

/**
 * Separa el nombre del comercio de la referencia que el resumen le pega atrás.
 *
 * El mainframe usa un campo de 17 caracteres para el comercio cuando además hay
 * referencia ("AUTOPISTA DEL OE 960003232276701"), pero deja correr el nombre
 * hasta 25 cuando no la hay ("SUPERMERCADO EL ABASTECED"). No hay un separador
 * confiable, así que se reconoce la referencia por su forma: un bloque de
 * caracteres sin espacios que arranca justo en la columna 17.
 *
 * Cuando no se puede distinguir, gana quedarse con el texto entero: una clave
 * de más es una regla de más, pero un nombre cortado a la mitad es una regla que
 * no vuelve a matchear nunca.
 */
export function separarComercio(bloque: string): string {
  const sinCola = bloque.replace(/\s+$/, '');

  // Dos o más espacios: el hueco que el formato deja antes de la referencia.
  const hueco = sinCola.match(/^(.+?)\s{2,}\S/);
  if (hueco) return hueco[1].trim();

  // Sin hueco, la referencia sólo existe si arranca exactamente en la 17.
  if (sinCola.length > 17 && sinCola[16] === ' ') {
    const resto = sinCola.slice(17);
    if (/^[A-Za-z0-9][A-Za-z0-9\-]{5,}$/.test(resto)) return sinCola.slice(0, 16).trim();
  }

  // Referencia pegada al nombre, sin ningún espacio de por medio:
  // "CIA SEG LA MER0000516260369-005-010". Se reconoce por ser una cola larga de
  // dígitos; un "YPF 3125 PLAYA" no la tiene y queda entero.
  const pegada = sinCola.match(/^(.*?[A-Za-z])\d{8,}[\d-]*$/);
  if (pegada && pegada[1].length >= 5) return pegada[1].trim();

  return sinCola.trim();
}

const enColumna = (linea: FragmentoPdf[], desde: number, hasta: number) =>
  linea
    .filter((f) => f.x >= desde && f.x < hasta)
    .map((f) => f.texto)
    .join('');

/** Lee la tabla de consumos de todas las páginas. */
export function leerResumenVisa(paginas: PaginaPdf[]): Resumen {
  const filas: FilaResumen[] = [];
  const tarjetas: { numero: string; titular: string }[] = [];
  let totalArs: number | null = null;
  let totalUsd: number | null = null;
  let indice = 0;

  /** Las filas todavía sin tarjeta asignada: el resumen la nombra al cerrar el bloque. */
  let sinTarjeta: FilaResumen[] = [];

  for (const pagina of paginas) {
    for (const linea of agruparEnLineas(pagina)) {
      const completo = linea.map((f) => f.texto).join(' ');

      // El bloque de cada tarjeta cierra con su subtotal, y recién ahí se sabe
      // de quién eran las filas de arriba.
      const cierre = completo.match(/TARJETA\s+(\d{3,4})\s+Total Consumos de\s+(.+?)\s{2,}/);
      if (cierre) {
        tarjetas.push({ numero: cierre[1], titular: cierre[2].trim() });
        for (const f of sinTarjeta) f.tarjeta = cierre[1];
        sinTarjeta = [];
        continue;
      }

      // "TOTAL A PAGAR" y sus importes están medio punto separados en vertical,
      // así que caen en la misma línea agrupada. Antes esta línea se salteaba y
      // el total terminaba tomándose del SALDO ANTERIOR, que es otra cosa.
      if (/TOTAL A PAGAR/i.test(completo)) {
        const importes = linea
          .filter((f) => f.x >= COLUMNA.comprobante)
          .map((f) => leerMonto(f.texto))
          .filter((n): n is number => n !== null);
        if (importes.length >= 1) totalArs = importes[0];
        if (importes.length >= 2) totalUsd = importes[1];
        continue;
      }

      // El saldo anterior no lleva fecha y no es un movimiento del período: es
      // el arrastre del resumen anterior, y sumarlo contaría dos veces lo mismo.
      const fechaBruta = enColumna(linea, 0, COLUMNA.fecha).trim();
      if (!/^\d{2}-\d{2}-\d{2}$/.test(fechaBruta)) continue;

      const fecha = leerFecha(fechaBruta);
      if (!fecha) continue;

      const bloque = enColumna(linea, COLUMNA.marca, COLUMNA.referencia);
      // En las filas en dólares el importe original viene pegado al comercio,
      // dentro del mismo campo: "ANTHROPIC  in1Tz3coBUSD    90,00".
      const detalle = bloque.replace(/\s*USD\s+[\d.,]+\s*$/, '');

      const textoArs = enColumna(linea, COLUMNA.comprobante, COLUMNA.pesos).trim();
      const textoUsd = enColumna(linea, COLUMNA.pesos, Infinity).trim();
      const bruto = textoArs || textoUsd;
      const monto = leerMonto(bruto);
      if (monto === null || monto === 0) continue;

      filas.push({
        indice: indice++,
        fecha,
        comercio: separarComercio(detalle),
        detalle: detalle.replace(/\s+/g, ' ').trim(),
        comprobante: enColumna(linea, COLUMNA.cuota, COLUMNA.comprobante).trim(),
        cuota: enColumna(linea, COLUMNA.referencia, COLUMNA.cuota).trim().match(/\d{2}\/\d{2}/)?.[0] ?? null,
        monto: Math.abs(monto),
        moneda: textoArs ? 'ARS' : 'USD',
        signo: bruto.trimStart().startsWith('-') ? -1 : 1,
        tarjeta: null,
        clase: /SU PAGO/i.test(detalle)
          ? 'pago'
          : /SALDO ANTERIOR/i.test(detalle)
            ? 'saldo'
            : PATRON_IMPUESTO.test(detalle)
              ? 'impuesto'
              : 'consumo',
      });
      sinTarjeta.push(filas[filas.length - 1]);
    }
  }

  return { filas, totalArs, totalUsd, tarjetas };
}

export interface ResultadoResumen {
  movimientos: Movimiento[];
  /** Pagos del resumen, que no se importan pero hay que informar. */
  pagos: FilaResumen[];
  /** Saldo anterior y otras filas de arrastre, que tampoco son movimientos. */
  arrastre: FilaResumen[];
}

/**
 * Pasa el resumen a movimientos, con el nombre de billetera que se le dé a la
 * tarjeta.
 *
 * Se emite una billetera por moneda porque el resumen mezcla pesos y dólares y
 * una billetera de Finza tiene una sola moneda. Las tres tarjetas del resumen
 * van a la misma: el resumen es uno y el pago también.
 */
export function resumenAMovimientos(resumen: Resumen, billetera: string): ResultadoResumen {
  const movimientos: Movimiento[] = [];
  const pagos: FilaResumen[] = [];
  const arrastre: FilaResumen[] = [];

  for (const f of resumen.filas) {
    if (f.clase === 'pago') { pagos.push(f); continue; }
    if (f.clase === 'saldo') { arrastre.push(f); continue; }

    // Una devolución baja lo que se debe: en una billetera de tarjeta eso es un
    // ingreso, igual que un reintegro.
    const tipo = f.signo === -1 ? 'income' : 'expense';
    const cuota = f.cuota ? ` (cuota ${f.cuota})` : '';

    movimientos.push({
      linea: f.indice + 1,
      fecha: f.fecha,
      fechaFacturado: null,
      tipo,
      // El resumen no trae categorías: las ponen las reglas sobre el comercio.
      grupo: '',
      categoria: '',
      comercio: f.comercio,
      detalle: `${f.detalle}${cuota}`,
      moneda: f.moneda,
      billetera,
      monto: f.monto,
      esTransferencia: false,
    });
  }

  return { movimientos, pagos, arrastre };
}
