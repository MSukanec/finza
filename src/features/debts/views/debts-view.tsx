'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { useUIStore } from '@/stores/ui-store';

import { SimpleAccordion } from '@/components/ui/simple-accordion';
import { Button } from '@/components/ui/button';
import { Plus, Landmark, Pencil } from 'lucide-react';

import { cn } from '@/lib/utils';

export function DebtsView() {
  const openSheet = useUIStore((s) => s.openSheet);
  
  const debts = useFinanceStore((s) => s.debts);
  const categories = useFinanceStore((s) => s.categories);
  const transactions = useFinanceStore((s) => s.transactions);
  const currencies = useFinanceStore((s) => s.currencies);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deudas</h1>
          <p className="text-muted-foreground">Gestiona tus pasivos y progreso de pagos</p>
        </div>
        <Button onClick={() => openSheet('new-debt')} className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva Deuda</span>
        </Button>
      </div>

      {debts.length === 0 ? (
        <div className="text-center py-12 border rounded-xl bg-card/50">
           <Landmark className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
           <h3 className="text-lg font-medium">No hay deudas activas</h3>
           <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-2 mb-6">
              Llevá un registro exacto de cuánto debés y controlá el historial de pagos de cada concepto de forma independiente.
           </p>
           <Button variant="outline" onClick={() => openSheet('new-debt')} className="gap-2">
             <Plus className="w-4 h-4" />
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
                           <div className={cn("p-2 rounded-lg", isCompleted ? "bg-income/10 text-income" : "bg-destructive/10 text-destructive")}>
                               <Landmark className="w-5 h-5" />
                           </div>
                           <div className="flex flex-col text-left">
                               <span className="font-semibold">{name}</span>
                               <span className="text-xs text-muted-foreground">{debt.description || `Moneda: ${debt.currency_code}`}</span>
                           </div>
                        </div>
                        <div className="flex flex-col items-end text-right">
                            <span className={cn("font-bold", isCompleted ? "text-income" : "")}>
                                {currencySymbol} {debt.total_amount.toLocaleString('es-AR')}
                            </span>
                            <span className="text-xs text-muted-foreground">
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
                             <div className="font-bold">{progress}%</div>
                          </div>
                          <div className="h-2.5 w-full bg-accent rounded-full overflow-hidden">
                              <div 
                                className={cn("h-full transition-all duration-500", isCompleted ? "bg-income" : "bg-primary")}
                                style={{ width: `${progress}%` }}
                              />
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pt-1">
                             <span>Abonado: {currencySymbol} {paidAmount.toLocaleString('es-AR')}</span>
                             <span>Total: {currencySymbol} {debt.total_amount.toLocaleString('es-AR')}</span>
                          </div>
                      </div>

                      <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-sm">Historial de Pagos</h4>
                          <Button variant="ghost" size="sm" className="h-8 gap-2 text-muted-foreground" onClick={(e) => { e.stopPropagation(); openSheet('edit-debt', { debt: { ...debt, category_name: name } }); }}>
                              <Pencil className="w-3.5 h-3.5" />
                              Editar Deuda
                          </Button>
                      </div>

                      {txs.length === 0 ? (
                          <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg bg-background/50">
                              Aún no has registrado pagos para esta deuda.
                          </div>
                      ) : (
                          <div className="space-y-2">
                             {txs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(tx => (
                                 <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border bg-background/50 hover:bg-accent/50 transition-colors">
                                     <div className="flex flex-col">
                                         <span className="text-sm font-medium">{tx.description || 'Abono general'}</span>
                                         <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat('es-AR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(tx.date))}</span>
                                     </div>
                                     <span className="font-semibold text-sm">
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
    </div>
  );
}
