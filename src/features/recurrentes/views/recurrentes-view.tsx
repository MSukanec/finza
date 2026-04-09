'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Repeat } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { PageLayout } from '@/components/layout/page-layout';
import { parseLocalDate } from '@/lib/utils';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const formatStrCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency.toUpperCase() || 'ARS' }).format(amount);
};

export function RecurrentesView() {
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const primaryCurrencyId = useFinanceStore((s) => s.primaryCurrencyId);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  const recurringCategories = useMemo(() => {
    return categories.filter(c => c.is_recurring).sort((a,b) => a.name.localeCompare(b.name));
  }, [categories]);

  // Aggregate data
  const matrix = useMemo(() => {
    // Setup empty matrix
    const data: Record<string, number[]> = {};
    for (const cat of recurringCategories) {
      data[cat.id] = new Array(12).fill(0);
    }

    // Filter txs
    const relevantTxs = transactions.filter(t => 
      t.type === 'expense' && 
      t.category_id && 
      recurringCategories.some(c => c.id === t.category_id)
    );

    for (const tx of relevantTxs) {
      if (!tx.category_id || !data[tx.category_id]) continue;

      let month = -1;
      let year = '';

      if (tx.period_month) {
        // "YYYY-MM" format
        const [y, m] = tx.period_month.split('-');
        year = y;
        month = parseInt(m, 10) - 1;
      } else {
        // Fallback to tx.date
        const d = parseLocalDate(tx.date);
        year = d.getFullYear().toString();
        month = d.getMonth();
      }

      if (year === selectedYear && month >= 0 && month <= 11) {
         let amount = tx.amount;
         // Convert to primary currency if needed
         if (tx.currency_id !== primaryCurrencyId) {
             const txRate = exchangeRates[tx.currency_id] || 1;
             const baseRate = exchangeRates[primaryCurrencyId] || 1;
             amount = amount * (baseRate / txRate);
         }
         data[tx.category_id][month] += amount;
      }
    }

    return data;
  }, [transactions, recurringCategories, selectedYear, primaryCurrencyId, exchangeRates]);

  const yearsOptions = useMemo(() => {
     const currentYear = new Date().getFullYear();
     const years = new Set<string>();
     years.add(currentYear.toString());
     
     transactions.forEach(t => {
         if (t.period_month) {
             years.add(t.period_month.split('-')[0]);
         } else {
             years.add(parseLocalDate(t.date).getFullYear().toString());
         }
     });

     return Array.from(years).sort((a,b) => parseInt(b) - parseInt(a));
  }, [transactions]);



  const monthlyTotals = useMemo(() => {
    const totals = new Array(12).fill(0);
    Object.values(matrix).forEach(monthsData => {
        monthsData.forEach((amount, idx) => {
            totals[idx] += amount;
        });
    });
    return totals;
  }, [matrix]);

  const globalTotal = useMemo(() => {
    return monthlyTotals.reduce((a, b) => a + b, 0);
  }, [monthlyTotals]);

  return (
    <PageLayout
       title="Gastos Recurrentes"
       icon={Repeat}
       actions={
            <Select value={selectedYear} onValueChange={(val) => val && setSelectedYear(val)}>
              <SelectTrigger className="w-[120px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                 {yearsOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
       }
    >

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Gasto Fijo Anual</p>
                  <p className="text-3xl font-black text-primary">{formatStrCurrency(globalTotal, primaryCurrencyId)}</p>
              </CardContent>
          </Card>
          <Card className="bg-card">
              <CardContent className="p-6 flex flex-col justify-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Promedio Fijo Mensual</p>
                  <p className="text-2xl font-bold">{formatStrCurrency(globalTotal / 12, primaryCurrencyId)}</p>
              </CardContent>
          </Card>
      </div>

      <Card className="shadow-lg border-primary/10 overflow-hidden">
        <CardHeader className="bg-primary/5 pb-4">
          <CardTitle className="text-lg">Mapa de Pagos Anual</CardTitle>
          <p className="text-sm text-muted-foreground">
             Una visión consolidada de tus compromisos fijos. Moneda base: {primaryCurrencyId.toUpperCase()}
          </p>
        </CardHeader>
        <CardContent className="p-0">
           {recurringCategories.length === 0 ? (
               <div className="p-12 text-center text-muted-foreground">
                   No tienes categorías marcadas como recurrentes.<br/>
                   Edita una categoría dándole clic a "Es Recurrente".
               </div>
           ) : (
               <ScrollArea className="w-full">
                  <div className="min-w-[800px] p-4">
                      {/* Header Row */}
                      <div className="flex mb-2">
                         <div className="w-[140px] shrink-0 font-semibold text-sm text-muted-foreground pt-4 pl-2">Categoría</div>
                         <div className="flex-1 min-w-0 grid grid-cols-12 gap-1 text-center font-medium text-xs text-muted-foreground">
                            {MONTHS.map(m => <div key={m} className="pt-4">{m}</div>)}
                         </div>
                      </div>

                      {/* Data Rows */}
                      <div className="space-y-1 mt-2">
                        {recurringCategories.map(cat => {
                           const rowData = matrix[cat.id];
                           return (
                                <div key={cat.id} className="flex group">
                                  <div className="w-[140px] shrink-0 py-3 pr-2 flex items-center border-r border-border/50 group-hover:bg-accent/30 transition-colors rounded-l-md">
                                     <div className="w-full pl-2 overflow-hidden flex flex-col justify-center" title={`${cat.group_name || 'General'} — ${cat.name}`}>
                                        <span className="font-medium text-sm truncate">{cat.name}</span>
                                        {cat.group_name && (
                                            <span className="text-[10px] text-muted-foreground truncate opacity-80">{cat.group_name}</span>
                                        )}
                                     </div>
                                  </div>
                                  <div className="flex-1 min-w-0 grid grid-cols-12 gap-1 px-1">
                                      {rowData.map((amount, idx) => {
                                          const isEmpty = amount === 0;
                                          return (
                                              <div 
                                                key={idx} 
                                                className={`h-full min-h-[44px] rounded-md flex items-center justify-center text-[10px] sm:text-xs font-semibold ${isEmpty ? 'bg-accent/10 text-muted-foreground/30' : 'bg-primary/10 text-primary'} `}
                                                title={!isEmpty ? formatStrCurrency(amount, primaryCurrencyId) : 'Sin pagos'}
                                              >
                                                 {!isEmpty && formatStrCurrency(amount, primaryCurrencyId)}
                                              </div>
                                          );
                                      })}
                                  </div>
                               </div>
                           );
                        })}
                      </div>

                      {/* Footer Row */}
                      <div className="flex mt-4 pt-3 border-t border-border/50">
                          <div className="w-[140px] shrink-0 font-black text-[10px] sm:text-xs pr-2 pl-2 flex items-center justify-start text-muted-foreground">
                              TOTAL MENSUAL
                          </div>
                          <div className="flex-1 min-w-0 grid grid-cols-12 gap-1 px-1">
                              {monthlyTotals.map((total, idx) => (
                                  <div key={`total-${idx}`} className="flex items-center justify-center font-bold text-[10px] sm:text-xs text-foreground bg-accent/20 rounded-md py-2 truncate" title={formatStrCurrency(total, primaryCurrencyId)}>
                                      {total > 0 ? formatStrCurrency(total, primaryCurrencyId) : '-'}
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
                  <ScrollBar orientation="horizontal" />
               </ScrollArea>
           )}
        </CardContent>
      </Card>
      
    </PageLayout>
  );
}
