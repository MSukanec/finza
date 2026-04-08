'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { formatMoney } from '@/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getIcon } from '@/lib/icons';
import { useMemo } from 'react';

export function BudgetsView() {
  const budgets = useFinanceStore((s) => s.budgets);
  const categories = useFinanceStore((s) => s.categories);
  const currencies = useFinanceStore((s) => s.currencies);
  const transactions = useFinanceStore((s) => s.transactions);

  // Calculate real spent amounts from this month's transactions
  const budgetWithRealSpent = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthExpenses = transactions.filter(
      (t) => t.type === 'expense' && new Date(t.date) >= startOfMonth
    );

    return budgets.map((budget) => ({
      ...budget,
      categories: budget.categories.map((bc) => {
        const spent = monthExpenses
          .filter((t) => t.category_id === bc.category_id)
          .reduce((sum, t) => sum + t.amount, 0);
        return { ...bc, spent_amount: spent };
      }),
    }));
  }, [budgets, transactions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Presupuestos</h1>
        <Button size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo</span>
        </Button>
      </div>

      {budgetWithRealSpent.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No hay presupuestos configurados</p>
          <Button size="sm" className="mt-4 gap-2">
            <Plus className="w-4 h-4" />
            Crear Presupuesto
          </Button>
        </div>
      ) : (
        budgetWithRealSpent.map((budget) => {
          const currency = currencies.find((c) => c.id === budget.currency_id) || currencies[0];
          const totalLimit = budget.categories.reduce((s, c) => s + c.limit_amount, 0);
          const totalSpent = budget.categories.reduce((s, c) => s + c.spent_amount, 0);
          const overallPercent = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

          return (
            <Card key={budget.id} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{budget.name}</CardTitle>
                  <span className={cn(
                    'text-xs font-semibold px-2 py-0.5 rounded-full',
                    overallPercent >= 100
                      ? 'bg-expense/15 text-expense'
                      : overallPercent >= 80
                        ? 'bg-warning/15 text-warning'
                        : 'bg-income/15 text-income'
                  )}>
                    {Math.round(overallPercent)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>Gastado: {formatMoney(totalSpent, currency)}</span>
                  <span>Límite: {formatMoney(totalLimit, currency)}</span>
                </div>
                <Progress
                  value={Math.min(overallPercent, 100)}
                  className="h-2 mt-2"
                />
              </CardHeader>
              <CardContent className="space-y-3">
                {budget.categories.map((bc) => {
                  const cat = categories.find((c) => c.id === bc.category_id);
                  const percent = bc.limit_amount > 0 ? (bc.spent_amount / bc.limit_amount) * 100 : 0;
                  const Icon = cat ? getIcon(cat.icon) : CheckCircle2;

                  return (
                    <div key={bc.category_id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center"
                            style={{ backgroundColor: `${cat?.color || '#6b7280'}20` }}
                          >
                            <Icon className="w-3.5 h-3.5" style={{ color: cat?.color }} />
                          </div>
                          <span className="text-sm">{cat?.name || 'Categoría'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {formatMoney(bc.spent_amount, currency)} / {formatMoney(bc.limit_amount, currency)}
                          </span>
                          {percent >= 100 && (
                            <AlertTriangle className="w-3.5 h-3.5 text-expense" />
                          )}
                        </div>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-accent/50 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            percent >= 100 ? 'bg-expense' : percent >= 80 ? 'bg-warning' : 'bg-income'
                          )}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
