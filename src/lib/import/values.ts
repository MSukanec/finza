/** Normalización y lectura de valores sueltos de una planilla. */

import { parseAmount } from '@/lib/money';

/**
 * Forma canónica de un texto para comparar: sin acentos, sin mayúsculas y sin
 * espacios de más. Se usa para encabezados, categorías y billeteras.
 */
export function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .replace(/﻿/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Como `normalizar`, pero descartando todo lo que no sea letra o número. */
export function clave(valor: unknown): string {
  return normalizar(valor).replace(/[^a-z0-9]/g, '');
}

/**
 * Monto de planilla. Devuelve `null` cuando la celda no expresa un importe.
 *
 * Distinguir "vacío" de "cero" importa: en esta planilla un guion suelto
 * significa "sin monto", y esas filas se saltean en vez de cargarse en 0.
 */
export function leerMonto(bruto: unknown): number | null {
  if (bruto == null) return null;
  const s = String(bruto).trim();
  if (!s || /^-+$/.test(s)) return null;
  return parseAmount(s);
}

/**
 * Fecha en formato argentino (día primero) o ISO.
 *
 * Se ancla al mediodía UTC a propósito: con `new Date(y, m, d)` en horario
 * local, una fecha del sur del continente cae en el día anterior al pasarla a
 * ISO, y toda la importación queda corrida un día.
 */
export function leerFecha(bruto: unknown): string | null {
  if (bruto == null) return null;
  const s = String(bruto).trim();
  if (!s) return null;

  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    const dia = Number(dmy[1]);
    const mes = Number(dmy[2]);
    const anio = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    const dt = new Date(Date.UTC(anio, mes - 1, dia, 12));
    // Rebota "31-02-2025", que el constructor acomodaría al 3 de marzo.
    if (dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) return null;
    return dt.toISOString();
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const dt = new Date(`${s.slice(0, 10)}T12:00:00Z`);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  return null;
}

/** El día calendario de una fecha ISO, para agrupar y comparar. */
export function diaDe(iso: string): string {
  return iso.slice(0, 10);
}

const MONEDAS: Record<string, string> = {
  pesos: 'ARS', peso: 'ARS', ars: 'ARS', '$': 'ARS',
  dolares: 'USD', dolar: 'USD', usd: 'USD', 'u$s': 'USD', 'us$': 'USD',
  euros: 'EUR', euro: 'EUR', eur: 'EUR',
};

/** Código ISO de moneda a partir de la columna FIAT. `null` si no se reconoce. */
export function leerMoneda(bruto: unknown): string | null {
  const n = normalizar(bruto);
  if (!n) return null;
  return MONEDAS[n] ?? (/^[a-z]{3}$/.test(n) ? n.toUpperCase() : null);
}

/** `Ingreso`/`Egreso` de la planilla al tipo de la app. */
export function leerTipo(bruto: unknown): 'income' | 'expense' | null {
  const n = clave(bruto);
  if (!n) return null;
  if (n.startsWith('ingreso') || n === 'credito' || n === 'haber') return 'income';
  if (n.startsWith('egreso') || n.startsWith('gasto') || n === 'debito' || n === 'debe') return 'expense';
  return null;
}
