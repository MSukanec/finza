'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { EXCHANGE_RATES } from '@/lib/mock-data';

export function SpendingChart() {
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const primaryCurrencyId = useFinanceStore((s) => s.primaryCurrencyId);

  const data = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const expenses = transactions.filter(
      (t) => t.type === 'expense' && new Date(t.date) >= startOfMonth
    );

    const byCat: Record<string, number> = {};
    expenses.forEach((t) => {
      const catId = t.category_id || 'unknown';
      const rate = EXCHANGE_RATES[t.currency_id] || 1;
      const primaryRate = EXCHANGE_RATES[primaryCurrencyId] || 1;
      const normalized = (t.amount * rate) / primaryRate;
      byCat[catId] = (byCat[catId] || 0) + normalized;
    });

    return Object.entries(byCat)
      .map(([catId, amount]) => {
        const cat = categories.find((c) => c.id === catId);
        return {
          name: cat?.name || 'Otros',
          value: Math.round(amount),
          color: cat?.color || '#6b7280',
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [transactions, categories, primaryCurrencyId]);

  if (data.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gastos por Categoría</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          Sin gastos este mes
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Gastos por Categoría</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="w-40 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [`$${Number(value).toLocaleString('es-AR')}`, '']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2 w-full">
            {data.slice(0, 5).map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-muted-foreground flex-1 truncate">{item.name}</span>
                <span className="text-xs font-medium">${item.value.toLocaleString('es-AR')}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
