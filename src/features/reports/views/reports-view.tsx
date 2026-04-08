'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EXCHANGE_RATES } from '@/lib/mock-data';
import { formatMoney } from '@/lib/money';
import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
  LineChart, Line,
} from 'recharts';

export function ReportsView() {
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const currencies = useFinanceStore((s) => s.currencies);
  const primaryCurrencyId = useFinanceStore((s) => s.primaryCurrencyId);
  const primaryCurrency = currencies.find((c) => c.id === primaryCurrencyId) || currencies[0];

  // Monthly Income vs Expense (last 6 months)
  const monthlyData = useMemo(() => {
    const months: { month: string; income: number; expense: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const label = d.toLocaleDateString('es-AR', { month: 'short' });

      const monthTxs = transactions.filter((t) => {
        const td = new Date(t.date);
        return td >= d && td <= end;
      });

      const income = monthTxs
        .filter((t) => t.type === 'income')
        .reduce((s, t) => {
          const rate = EXCHANGE_RATES[t.currency_id] || 1;
          const pr = EXCHANGE_RATES[primaryCurrencyId] || 1;
          return s + (t.amount * rate) / pr;
        }, 0);

      const expense = monthTxs
        .filter((t) => t.type === 'expense')
        .reduce((s, t) => {
          const rate = EXCHANGE_RATES[t.currency_id] || 1;
          const pr = EXCHANGE_RATES[primaryCurrencyId] || 1;
          return s + (t.amount * rate) / pr;
        }, 0);

      months.push({ month: label, income: Math.round(income), expense: Math.round(expense) });
    }
    return months;
  }, [transactions, primaryCurrencyId]);

  // Category breakdown
  const categoryData = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const expenses = transactions.filter(
      (t) => t.type === 'expense' && new Date(t.date) >= startOfMonth
    );

    const byCat: Record<string, number> = {};
    expenses.forEach((t) => {
      const catId = t.category_id || 'unknown';
      const rate = EXCHANGE_RATES[t.currency_id] || 1;
      const pr = EXCHANGE_RATES[primaryCurrencyId] || 1;
      byCat[catId] = (byCat[catId] || 0) + (t.amount * rate) / pr;
    });

    return Object.entries(byCat)
      .map(([catId, amount]) => {
        const cat = categories.find((c) => c.id === catId);
        return { name: cat?.name || 'Otros', value: Math.round(amount), color: cat?.color || '#6b7280' };
      })
      .sort((a, b) => b.value - a.value);
  }, [transactions, categories, primaryCurrencyId]);

  // Daily spending trend this month
  const dailyTrend = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const days: { day: string; amount: number }[] = [];

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= Math.min(daysInMonth, now.getDate()); i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), i);
      const dayExpenses = transactions
        .filter((t) => {
          const td = new Date(t.date);
          return t.type === 'expense' && td.getDate() === i && td.getMonth() === now.getMonth();
        })
        .reduce((s, t) => {
          const rate = EXCHANGE_RATES[t.currency_id] || 1;
          const pr = EXCHANGE_RATES[primaryCurrencyId] || 1;
          return s + (t.amount * rate) / pr;
        }, 0);
      days.push({ day: `${i}`, amount: Math.round(dayExpenses) });
    }
    return days;
  }, [transactions, primaryCurrencyId]);

  const tooltipStyle = {
    contentStyle: {
      background: 'hsl(var(--card))',
      border: '1px solid hsl(var(--border))',
      borderRadius: '8px',
      padding: '8px 12px',
      fontSize: '12px',
    },
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Reportes</h1>

      {/* Income vs Expense Bar Chart */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ingresos vs Gastos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip {...tooltipStyle} formatter={(value) => [`$${Number(value).toLocaleString('es-AR')}`, '']} />
                <Bar dataKey="income" fill="hsl(var(--income))" radius={[4, 4, 0, 0]} name="Ingresos" />
                <Bar dataKey="expense" fill="hsl(var(--expense))" radius={[4, 4, 0, 0]} name="Gastos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-income" />
              <span className="text-xs text-muted-foreground">Ingresos</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-expense" />
              <span className="text-xs text-muted-foreground">Gastos</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gastos por Categoría</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
            ) : (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipStyle} formatter={(value) => [`$${Number(value).toLocaleString('es-AR')}`, '']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-2">
                  {categoryData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-muted-foreground flex-1 truncate">{item.name}</span>
                      <span className="text-xs font-medium">{formatMoney(item.value, primaryCurrency)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Daily Trend */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tendencia Diaria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip {...tooltipStyle} formatter={(value) => [`$${Number(value).toLocaleString('es-AR')}`, '']} />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                    name="Gasto diario"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
