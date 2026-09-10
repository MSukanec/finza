'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useFinanceStore } from '@/stores/finance-store';
import { EXCHANGE_RATES } from '@/lib/mock-data';
import { formatMoney } from '@/lib/money';
import { parseLocalDate } from '@/lib/utils';
import { PieChart } from 'lucide-react';
import { Panel } from '@/components/ui/panel';

/**
 * En qué se fue la plata este mes. Barras de proporción, no un gráfico:
 * comparar largos es más preciso que comparar ángulos, y el nombre va al lado.
 */
export function TopCategories() {
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const currencies = useFinanceStore((s) => s.currencies);
  const primaryCurrencyId = useFinanceStore((s) => s.primaryCurrencyId);

  const currency = currencies.find((c) => c.id === primaryCurrencyId) || currencies[0];

  const { rows, total } = useMemo(() => {
    const toPrimary = (amount: number, currencyId: string) => {
      const rate = EXCHANGE_RATES[currencyId] || 1;
      const primaryRate = EXCHANGE_RATES[primaryCurrencyId] || 1;
      return (amount * rate) / primaryRate;
    };

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const acc = new Map<string, number>();
    let total = 0;

    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      if (parseLocalDate(t.date) < start) continue;
      const cat = categories.find((c) => c.id === t.category_id);
      const name = cat?.name ?? 'Sin categoría';
      const v = toPrimary(t.amount, t.currency_id);
      acc.set(name, (acc.get(name) || 0) + v);
      total += v;
    }

    const rows = [...acc.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    return { rows, total };
  }, [transactions, categories, primaryCurrencyId]);

  const max = rows[0]?.value ?? 1;

  return (
    <Panel
      icon={PieChart}
      title="En qué se fue este mes"
      description="Las categorías que más pesan"
      actions={
        <Link
          href="/reports"
          className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Ver reportes
        </Link>
      }
    >
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted">
            <PieChart className="size-5 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium">Sin gastos este mes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{r.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatMoney(r.value, currency)}
                  <span className="ml-2 text-xs">
                    {total > 0 ? ((r.value / total) * 100).toFixed(0) : 0}%
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground"
                  style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
