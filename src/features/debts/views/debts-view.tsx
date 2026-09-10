'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { useUIStore } from '@/stores/ui-store';

import { SimpleAccordion } from '@/components/ui/simple-accordion';
import { Button } from '@/components/ui/button';
import { Plus, Landmark, Pencil } from 'lucide-react';
import { cn, parseLocalDate } from '@/lib/utils';
import { PageLayout } from '@/components/layout/page-layout';

export function DebtsView() {
  const openSheet = useUIStore((s) => s.openSheet);
  
  const debts = useFinanceStore((s) => s.debts);
  const categories = useFinanceStore((s) => s.categories);
  const transactions = useFinanceStore((s) => s.transactions);
  const currencies = useFinanceStore((s) => s.currencies);

  return (
    <PageLayout
      title="Deudas"
      icon={Landmark}
      actions={
        <Button size="sm" onClick={() => openSheet('new-debt')} className="gap-2">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Nueva Deuda</span>
        </Button>
      }
    >

      {debts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
           <Landmark className="size-12 mx-auto text-muted-foreground mb-4 opacity-50" />
           <h3 className="text-lg font-semibold tracking-tight">No hay deudas activas</h3>
           <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-2 mb-6">
              Llevá un registro exacto de cuánto debés y controlá el historial de pagos de cada concepto de forma independiente.
           </p>
           <Button variant="outline" size="sm" onClick={() => openSheet('new-debt')} className="gap-2">
             <Plus className="size-4" />
             Crear Deuda
           </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {debts.map(debt => {
            const category = categories.find(c => c.id === debt.category_id);
            const name = category?.name || 'Deuda sin nombre';
            const currencySymbol = currencies.find(curr => curr.id.toUpperCase() === debt.currency_code.toUpperCase())?.symbol || '$';
            
            // Sum transactions
            const txs = transactions.filter(t => t.category_id === debt.category_id);
            const paidAmount = txs.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : 0), 0);
            const remaining = Math.max(0, debt.total_amount - paidAmount);
            const progress = debt.total_amount > 0 ? Math.min(100, Math.round((paidAmount / debt.total_amount) * 100)) : 0;
            
            const isCompleted = progress >= 100;

            return (
               <SimpleAccordion 
                 key={debt.id}
                 title={
                    <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-3">
                           <div className={cn("flex size-10 items-center justify-center rounded-xl", isCompleted ? "bg-income/12 text-income" : "bg-expense/12 text-expense")}>
                               <Landmark className="size-5" />
                           </div>
                           <div className="flex flex-col text-left">
                               <span className="font-semibold tracking-tight">{name}</span>
                               <span className="text-xs text-muted-foreground">{debt.description || `Moneda: ${debt.currency_code}`}</span>
                           </div>
                        </div>
                        <div className="flex flex-col items-end text-right">
                            <span className={cn("font-semibold tabular-nums", isCompleted ? "text-income" : "")}>
                                {currencySymbol} {debt.total_amount.toLocaleString('es-AR')}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                                Restante: {currencySymbol} {remaining.toLocaleString('es-AR')}
                            </span>
                        </div>
                    </div>
                 }
               >
                  <div className="p-4 space-y-4">
                      {/* Bar & Stats */}
                      <div className="space-y-2 mb-6">
                          <div className="flex items-center justify-between text-sm">
                             <div className="font-medium text-muted-foreground">Progreso de Pago</div>
                             <div className="font-semibold tabular-nums">{progress}%</div>
                          </div>
                          <div className="h-2.5 w-full bg-accent rounded-full overflow-hidden">
                              <div
                                className={cn("h-full transition-all duration-500", isCompleted ? "bg-income" : "bg-primary")}
                                style={{ width: `${progress}%` }}
                              />
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pt-1 tabular-nums">
                             <span>Abonado: {currencySymbol} {paidAmount.toLocaleString('es-AR')}</span>
                             <span>Total: {currencySymbol} {debt.total_amount.toLocaleString('es-AR')}</span>
                          </div>
                      </div>

                      <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold tracking-tight text-sm">Historial de Pagos</h4>
                          <Button variant="ghost" size="sm" className="h-8 gap-2 text-muted-foreground" onClick={(e) => { e.stopPropagation(); openSheet('edit-debt', { debt: { ...debt, category_name: name } }); }}>
                              <Pencil className="size-4" />
                              Editar Deuda
                          </Button>
                      </div>

                      {txs.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                              Aún no has registrado pagos para esta deuda.
                          </div>
                      ) : (
                          <div className="space-y-1">
                             {txs.sort((a,b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()).map(tx => (
                                 <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-accent/60 transition-colors">
                                     <div className="flex flex-col">
                                         <span className="text-sm font-medium">{tx.description || 'Abono general'}</span>
                                         <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat('es-AR', { year: 'numeric', month: 'long', day: 'numeric' }).format(parseLocalDate(tx.date))}</span>
                                     </div>
                                     <span className="font-semibold text-sm tabular-nums">
                                         {currencies.find(c => c.id.toUpperCase() === tx.currency_id.toUpperCase())?.symbol || '$'} {tx.amount.toLocaleString('es-AR')}
                                     </span>
                                 </div>
                             ))}
                          </div>
                      )}
                  </div>
               </SimpleAccordion>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
