import type { Currency } from './types';

/**
 * Formats a number as a currency string.
 */
export function formatMoney(
  amount: number,
  currency: Currency,
  options?: { showSign?: boolean; compact?: boolean }
): string {
  const { showSign = false, compact = false } = options || {};

  const formatted = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: compact ? 0 : currency.decimals,
    maximumFractionDigits: currency.decimals,
    ...(compact && Math.abs(amount) >= 1000
      ? { notation: 'compact', compactDisplay: 'short' }
      : {}),
  }).format(Math.abs(amount));

  const sign = amount < 0 ? '-' : amount > 0 && showSign ? '+' : '';

  return `${sign}${currency.symbol}${formatted}`;
}

/**
 * Formats an amount with color class based on sign.
 */
export function getAmountColorClass(amount: number, type?: 'income' | 'expense' | 'transfer'): string {
  if (type === 'transfer') return 'text-transfer';
  if (type === 'income' || amount > 0) return 'text-income';
  if (type === 'expense' || amount < 0) return 'text-expense';
  return 'text-foreground';
}

/**
 * Convert between currencies.
 */
export function convertCurrency(
  amount: number,
  fromRate: number,
  toRate: number
): number {
  if (fromRate === 0) return 0;
  return (amount / fromRate) * toRate;
}

/**
 * Interpreta lo que el usuario escribió como monto.
 *
 * Acepta coma o punto como decimal y tolera separadores de miles, porque acá se
 * escribe indistintamente "1234,56", "1.234,56" o "1234.56". Devuelve null si
 * no hay un número válido: eso permite distinguir "vacío" de "cero", que no son
 * lo mismo al validar.
 *
 * La versión anterior hacía `.replace(',', '.')`, que sólo reemplaza la PRIMERA
 * coma: "1.234,56" quedaba en "1.234.56" y parseFloat devolvía 1.234.
 */
export function parseAmount(value: string): number | null {
  if (typeof value !== 'string') return null;
  let s = value.trim().replace(/\s/g, '').replace(/[^\d.,\-]/g, '');
  if (!s || s === '-') return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // El decimal es el separador que aparece más a la derecha.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // Una sola coma: decimal, salvo que separe grupos de 3 ("1,234").
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== '0'
      ? s.replace(',', '')
      : s.replace(',', '.');
  } else if (lastDot !== -1) {
    // Sólo puntos, que acá suelen ser miles: "1.234.567" es un millón y pico,
    // no 1,234. Con más de un punto no hay duda; con uno solo, tres dígitos
    // después indican miles ("1.234") y cualquier otra cantidad, decimales
    // ("1.5", "1.50").
    const parts = s.split('.');
    const soloMiles =
      parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0] !== '0');
    if (soloMiles) s = s.replace(/\./g, '');
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** @deprecated Usar parseAmount, que distingue vacío de cero. */
export function parseMoneyInput(value: string): number {
  return parseAmount(value) ?? 0;
}
