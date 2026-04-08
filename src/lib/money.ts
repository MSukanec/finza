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
 * Parse a numeric input string to a number, handling locale formats.
 */
export function parseMoneyInput(value: string): number {
  const cleaned = value.replace(/[^\d.,\-]/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}
