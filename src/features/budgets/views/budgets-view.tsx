'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { formatMoney } from '@/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn, parseLocalDate } from '@/lib/utils';
import { getIcon } from '@/lib/icons';
import { useMemo } from 'react';
import { Target } from 'lucide-react';
import { PageLayout } from '@/components/layout/page-layout';
import { EXCHANGE_RATES } from '@/lib/mock-data';
import { useUIStore } from '@/stores/ui-store';
import { useGlobalDialog } from '@/components/providers/dialog-provider';
import { Pencil, Trash2 } from 'lucide-react';

export function BudgetsView() {
  const budgets = useFinanceStore((s) => s.budgets);
  const categories = useFinanceStore((s) => s.categories);
  const currencies = useFinanceStore((s) => s.currencies);
  const transactions = useFinanceStore((s) => s.transactions);
  const removeBudget = useFinanceStore((s) => s.removeBudget);
  const openSheet = useUIStore((s) => s.openSheet);
  const dialog = useGlobalDialog();

  const handleDelete = async (id: string, name: string) => {
    const ok = await dialog.confirm('Eliminar presupuesto', `¿Eliminar "${name}"? No se puede deshacer.`);
    if (ok) await removeBudget(id);
  };

  const budgetWithRealSpent = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Semana ISO: arranca lunes. Antes todo se calculaba contra el mes, así que
    // un presupuesto semanal mostraba el gasto de las últimas 4 semanas.
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

    const expenses = transactions.filter((t) => t.type === 'expense');

    return budgets.map((budget) => {
      const from = budget.period === 'weekly' ? startOfWeek : startOfMonth;
      const rate = EXCHANGE_RATES[budget.currency_id] || 1;

      return {
        ...budget,
        periodLabel: budget.period === 'weekly' ? 'Esta semana' : 'Este mes',
        categories: budget.categories.map((bc) => {
          const spent = expenses
            .filter((t) => t.category_id === bc.category_id && parseLocalDate(t.date) >= from)
            // El gasto puede estar en otra moneda que el presupuesto.
            .reduce((sum, t) => sum + (t.amount * (EXCHANGE_RATES[t.currency_id] || 1)) / rate, 0);
          return { ...bc, spent_amount: spent };
        }),
      };
    });
  }, [budgets, transactions]);

  return (
    <PageLayout
      title="Presupuestos"
      icon={Target}
      actions={
        <Button size="sm" className="gap-1.5" onClick={() => openSheet('new-budget')}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Nuevo</span>
        </Button>
      }
    >

      {budgetWithRealSpent.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground mb-4">
            <AlertTriangle className="size-8" />
          </div>
          <p className="text-muted-foreground text-sm">No hay presupuestos configurados</p>
          <Button className="mt-4 gap-2" onClick={() => openSheet('new-budget')}>
            <Plus className="size-4" />
            Crear presupuesto
          </Button>
        </div>
      ) : (
        budgetWithRealSpent.map((budget) => {
          const currency = currencies.find((c) => c.id === budget.currency_id) || currencies[0];
          const totalLimit = budget.categories.reduce((s, c) => s + c.limit_amount, 0);
          const totalSpent = budget.categories.reduce((s, c) => s + c.spent_amount, 0);
          const overallPercent = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

          return (
            <Card key={budget.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="min-w-0 truncate text-base">{budget.name}</CardTitle>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => openSheet('edit-budget', { budget })}
                      aria-label="Editar presupuesto"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(budget.id, budget.name)}
                      aria-label="Eliminar presupuesto"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  <span className={cn(
                    'text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full',
                    overallPercent >= 100
                      ? 'bg-expense/15 text-expense'
                      : overallPercent >= 80
                        ? 'bg-warning/15 text-warning'
                        : 'bg-income/15 text-income'
                  )}>
                    {Math.round(overallPercent)}%
                  </span>
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                  <span>{budget.periodLabel}: {formatMoney(totalSpent, currency)}</span>
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
                  const Icon = cat?.icon ? getIcon(cat.icon) : CheckCircle2;

                  return (
                    <div key={bc.category_id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex size-8 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                            <Icon className="size-4" />
                          </div>
                          <span className="text-sm">{cat?.name || 'Categoría'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatMoney(bc.spent_amount, currency)} / {formatMoney(bc.limit_amount, currency)}
                          </span>
                          {percent >= 100 && (
                            <AlertTriangle className="size-3.5 text-expense" />
                          )}
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            percent >= 100 ? 'bg-expense' : 'bg-primary'
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
    </PageLayout>
  );
}
