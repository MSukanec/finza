'use client';

import { useMemo } from 'react';
import { useFinanceStore } from '@/stores/finance-store';
import { EXCHANGE_RATES } from '@/lib/mock-data';
import { parseLocalDate } from '@/lib/utils';
import type { Transaction } from '@/lib/types';

export type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type Metric = 'income' | 'expense' | 'net';

export interface ReportFilters {
  grain: Grain;
  metric: Metric;
  /** null = sin límite por ese lado */
  from: Date | null;
  to: Date | null;
  walletId: string | 'all';
  groupId: string | 'all';
}

export const GRAINS: { id: Grain; label: string; avgWindow: number }[] = [
  { id: 'day', label: 'Día', avgWindow: 7 },
  { id: 'week', label: 'Semana', avgWindow: 4 },
  { id: 'month', label: 'Mes', avgWindow: 3 },
  { id: 'quarter', label: 'Trimestre', avgWindow: 2 },
  { id: 'year', label: 'Año', avgWindow: 1 },
];

export const METRICS: { id: Metric; label: string }[] = [
  { id: 'income', label: 'Ingresos' },
  { id: 'expense', label: 'Egresos' },
  { id: 'net', label: 'Neto' },
];

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function bucketStart(d: Date, grain: Grain): Date {
  switch (grain) {
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    case 'week': {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // semana ISO: lunes
      return x;
    }
    case 'month':
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case 'quarter':
      return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
    case 'year':
      return new Date(d.getFullYear(), 0, 1);
  }
}

function nextBucket(d: Date, grain: Grain): Date {
  const x = new Date(d);
  if (grain === 'day') x.setDate(x.getDate() + 1);
  else if (grain === 'week') x.setDate(x.getDate() + 7);
  else if (grain === 'month') x.setMonth(x.getMonth() + 1);
  else if (grain === 'quarter') x.setMonth(x.getMonth() + 3);
  else x.setFullYear(x.getFullYear() + 1);
  return x;
}

export function bucketLabel(d: Date, grain: Grain): string {
  switch (grain) {
    case 'day':
    case 'week':
      return `${d.getDate()} ${MES[d.getMonth()]}`;
    case 'month':
      return `${MES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    case 'quarter':
      return `T${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}`;
    case 'year':
      return String(d.getFullYear());
  }
}

export const fullDate = (d: Date) =>
  d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

export interface Bucket {
  date: Date;
  label: string;
  income: number;
  expense: number;
  net: number;
  /**
   * El mismo neto pero fechado por cuándo se movió la plata, no por cuándo
   * ocurrió el hecho. Comparado contra `net` muestra el desfase: un mes puede
   * cerrar en positivo y la caja recién verlo dos meses después.
   */
  cash: number;
  /** El valor de la métrica elegida, para los gráficos de una serie. */
  value: number;
  avg: number | null;
  cumulative: number;
}

export interface Slice {
  key: string;
  name: string;
  value: number;
}

/**
 * Todo lo que la página de Reportes necesita, derivado de un único juego de
 * filtros. Cada gráfico consume una parte de esto, así que todos muestran
 * siempre el mismo recorte.
 */
export function useReportData(filters: ReportFilters) {
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const accounts = useFinanceStore((s) => s.accounts);
  const currencies = useFinanceStore((s) => s.currencies);
  const primaryCurrencyId = useFinanceStore((s) => s.primaryCurrencyId);

  const currency = currencies.find((c) => c.id === primaryCurrencyId) || currencies[0];

  return useMemo(() => {
    const toPrimary = (amount: number, currencyId: string) => {
      const rate = EXCHANGE_RATES[currencyId] || 1;
      const primaryRate = EXCHANGE_RATES[primaryCurrencyId] || 1;
      return (amount * rate) / primaryRate;
    };

    const categoryById = new Map(categories.map((c) => [c.id, c]));

    // ---- filtrado ----
    const filtered = transactions.filter((t: Transaction) => {
      if (t.type !== 'income' && t.type !== 'expense') return false;
      const d = parseLocalDate(t.date);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      if (filters.walletId !== 'all' && t.account_id !== filters.walletId) return false;
      if (filters.groupId !== 'all') {
        const cat = t.category_id ? categoryById.get(t.category_id) : undefined;
        if (cat?.group_id !== filters.groupId) return false;
      }
      return true;
    });

    // ---- serie temporal ----
    const raw = new Map<number, { income: number; expense: number }>();
    // Los mismos movimientos, fechados por cuándo se movió la plata. Es la
    // otra mitad de la historia: `raw` dice si el negocio funcionó, `caja` dice
    // cuándo se sintió en el banco.
    const caja = new Map<number, number>();

    for (const t of filtered) {
      const v = toPrimary(t.amount, t.currency_id);

      const key = bucketStart(parseLocalDate(t.date), filters.grain).getTime();
      const b = raw.get(key) ?? { income: 0, expense: 0 };
      if (t.type === 'income') b.income += v;
      else b.expense += v;
      raw.set(key, b);

      const kCaja = bucketStart(parseLocalDate(t.settles_at ?? t.date), filters.grain).getTime();
      caja.set(kCaja, (caja.get(kCaja) ?? 0) + (t.type === 'income' ? v : -v));
    }

    // El eje tiene que llegar hasta el último movimiento de plata, no hasta el
    // último hecho: si no, los cheques que vencen más adelante que la última
    // compra quedarían fuera del gráfico.
    const keys = [...new Set([...raw.keys(), ...caja.keys()])].sort((a, b) => a - b);
    const buckets: Bucket[] = [];

    if (keys.length) {
      // Los períodos vacíos ocupan su lugar: si no, el eje comprime el tiempo
      // y la curva de promedio miente sobre la pendiente.
      let cursor = new Date(keys[0]);
      const end = new Date(keys[keys.length - 1]);
      let running = 0;
      while (cursor <= end) {
        const b = raw.get(cursor.getTime()) ?? { income: 0, expense: 0 };
        const net = b.income - b.expense;
        running += net;
        buckets.push({
          date: new Date(cursor),
          label: bucketLabel(cursor, filters.grain),
          income: b.income,
          expense: b.expense,
          net,
          cash: caja.get(cursor.getTime()) ?? 0,
          value: filters.metric === 'income' ? b.income : filters.metric === 'expense' ? b.expense : net,
          avg: null,
          cumulative: running,
        });
        cursor = nextBucket(cursor, filters.grain);
      }

      // Promedio móvil centrado: muestra la tendencia en cada punto en vez de
      // arrastrar el pasado.
      const w = GRAINS.find((g) => g.id === filters.grain)!.avgWindow;
      if (w > 1) {
        const half = Math.floor(w / 2);
        for (let i = 0; i < buckets.length; i++) {
          const from = Math.max(0, i - half);
          const to = Math.min(buckets.length - 1, i + half);
          let sum = 0;
          for (let j = from; j <= to; j++) sum += buckets[j].value;
          buckets[i].avg = sum / (to - from + 1);
        }
      }
    }

    // ---- cortes por dimensión (siempre sobre egresos: presupuestar ingresos
    //      por categoría no dice nada) ----
    const expenses = filtered.filter((t) => t.type === 'expense');

    const sumBy = (getKey: (t: Transaction) => { key: string; name: string } | null): Slice[] => {
      const acc = new Map<string, Slice>();
      for (const t of expenses) {
        const k = getKey(t);
        if (!k) continue;
        const prev = acc.get(k.key) ?? { key: k.key, name: k.name, value: 0 };
        prev.value += toPrimary(t.amount, t.currency_id);
        acc.set(k.key, prev);
      }
      return [...acc.values()].sort((a, b) => b.value - a.value);
    };

    const byCategory = sumBy((t) => {
      const cat = t.category_id ? categoryById.get(t.category_id) : undefined;
      return { key: cat?.id ?? 'none', name: cat?.name ?? 'Sin categoría' };
    });

    const byGroup = sumBy((t) => {
      const cat = t.category_id ? categoryById.get(t.category_id) : undefined;
      return { key: cat?.group_id ?? 'none', name: cat?.group_name ?? 'Sin grupo' };
    });

    const byWallet = sumBy((t) => {
      const acc = accounts.find((a) => a.id === t.account_id);
      return { key: acc?.id ?? 'none', name: acc?.name ?? 'Sin billetera' };
    });

    // ---- composición por período ----
    // Un registro por cubo con el gasto de cada grupo, para el apilado.
    const bucketIndex = new Map<number, number>();
    buckets.forEach((b, i) => bucketIndex.set(b.date.getTime(), i));

    const groupBreakdown: Record<string, number>[] = buckets.map(() => ({}));
    for (const t of expenses) {
      const idx = bucketIndex.get(bucketStart(parseLocalDate(t.date), filters.grain).getTime());
      if (idx === undefined) continue;
      const cat = t.category_id ? categoryById.get(t.category_id) : undefined;
      const key = cat?.group_id ?? 'none';
      groupBreakdown[idx][key] = (groupBreakdown[idx][key] || 0) + toPrimary(t.amount, t.currency_id);
    }

    // ---- totales ----
    const totalIncome = buckets.reduce((s, b) => s + b.income, 0);
    const totalExpense = buckets.reduce((s, b) => s + b.expense, 0);
    const net = totalIncome - totalExpense;
    const periods = buckets.length || 1;

    return {
      currency,
      buckets,
      byCategory,
      byGroup,
      byWallet,
      groupBreakdown,
      count: filtered.length,
      totalIncome,
      totalExpense,
      net,
      avgIncome: totalIncome / periods,
      avgExpense: totalExpense / periods,
      // Cuánto de cada peso que entra queda. Sin ingresos no es 0: es indefinido.
      savingsRate: totalIncome > 0 ? (net / totalIncome) * 100 : null,
      rangeLabel:
        buckets.length > 0
          ? `${fullDate(buckets[0].date)} — ${fullDate(buckets[buckets.length - 1].date)}`
          : '',
    };
  }, [transactions, categories, accounts, currency, primaryCurrencyId, filters]);
}
