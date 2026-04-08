'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { formatMoney } from '@/lib/money';
import { getIcon } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EXCHANGE_RATES } from '@/lib/mock-data';
import { Plus, TrendingUp, ChevronDown, ChevronRight, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

// Native UI Accordion Helper Component (Same pattern used in Categories)
function SimpleAccordion({ title, summary, children, defaultOpen = false }: { title: React.ReactNode, summary: React.ReactNode, children: React.ReactNode, defaultOpen?: boolean }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    
    return (
        <div className="border border-border/50 rounded-xl overflow-hidden mb-3 bg-card shadow-sm">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 bg-accent/20 hover:bg-accent/40 transition-colors text-left"
            >
                <div className="flex items-center gap-3">
                   {isOpen ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                   {title}
                </div>
                <div>
                   {summary}
                </div>
            </button>
            {isOpen && (
                <div className="p-2 border-t border-border/50 space-y-1">
                    {children}
                </div>
            )}
        </div>
    );
}

export function AccountsView() {
  const accounts = useFinanceStore((s) => s.accounts);
  const currencies = useFinanceStore((s) => s.currencies);
  const primaryCurrencyId = useFinanceStore((s) => s.primaryCurrencyId);
  const openSheet = useUIStore((s) => s.openSheet);

  const primaryCurrency = currencies.find((c) => c.id === primaryCurrencyId) || currencies[0];

  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => {
      const rate = EXCHANGE_RATES[acc.currency_id] || 1;
      const primaryRate = EXCHANGE_RATES[primaryCurrencyId] || 1;
      return sum + (acc.balance * rate) / primaryRate;
    }, 0);
  }, [accounts, primaryCurrencyId]);

  const accountTypeLabels: Record<string, string> = {
    cash: 'Efectivo',
    bank: 'Banco',
    digital: 'Billetera Digital',
  };

  // Group accounts by currency
  const groupedAccounts = useMemo(() => {
     const groupsMap = new Map<string, { currency: any, total: number, accounts: any[] }>();

     accounts.forEach(acc => {
         if (!groupsMap.has(acc.currency_id)) {
             const curr = currencies.find(c => c.id === acc.currency_id);
             groupsMap.set(acc.currency_id, {
                 currency: curr || { id: acc.currency_id, code: acc.currency_id, symbol: '$', name: 'Moneda' },
                 total: 0,
                 accounts: []
             });
         }
         
         const group = groupsMap.get(acc.currency_id)!;
         group.total += acc.balance;
         group.accounts.push(acc);
     });

     const groupsArray = Array.from(groupsMap.values());
     
     // Order groups: "ars" (Pesos) first, then "usd", then others. Then fallback to alphabetical.
     groupsArray.sort((a, b) => {
         if (a.currency.id === 'ars' && b.currency.id !== 'ars') return -1;
         if (a.currency.id !== 'ars' && b.currency.id === 'ars') return 1;
         if (a.currency.id === 'usd' && b.currency.id !== 'usd') return -1;
         if (a.currency.id !== 'usd' && b.currency.id === 'usd') return 1;
         return a.currency.name.localeCompare(b.currency.name);
     });

     // Order internal accounts alphabetically by name
     groupsArray.forEach(g => {
         g.accounts.sort((a, b) => a.name.localeCompare(b.name));
     });

     return groupsArray;
  }, [accounts, currencies]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cuentas y Billeteras</h1>
        <Button size="sm" className="gap-2" onClick={() => openSheet('new-account')}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva Cuenta</span>
        </Button>
      </div>

      {/* Patrimonio Total Global */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/15 p-5">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Patrimonio Total Unificado</p>
          </div>
          <p className="text-2xl md:text-3xl font-bold animate-count-up">
            {formatMoney(totalBalance, primaryCurrency)}
          </p>
        </div>
      </div>

      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
         {groupedAccounts.map(group => (
             <SimpleAccordion 
                key={group.currency.id}
                defaultOpen={true}
                title={
                    <div className="flex items-center gap-2">
                       <Wallet className="w-4 h-4 text-muted-foreground" />
                       <span className="font-bold text-sm tracking-wide uppercase">Cuentas en {group.currency.name}</span>
                    </div>
                }
                summary={
                   <div className={cn("font-bold text-sm", group.total < 0 ? "text-expense" : "")}>
                       Total acumulado: {formatMoney(group.total, group.currency)}
                   </div>
                }
             >
                 {group.accounts.map(acc => {
                     const Icon = getIcon(acc.icon);
                     return (
                         <div 
                             key={acc.id}
                             onClick={() => openSheet('edit-account', { account: acc })}
                             className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg hover:bg-accent/40 cursor-pointer transition-colors border border-transparent hover:border-border/50"
                         >
                             <div className="flex items-center gap-4 min-w-0 flex-1 mb-2 sm:mb-0">
                                 <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                                    style={{ backgroundColor: `${acc.color || '#4f4f4f'}20` }}
                                  >
                                    <Icon className="w-5 h-5" style={{ color: acc.color || '#4f4f4f' }} />
                                  </div>
                                  <div className="min-w-0">
                                      <p className="font-semibold text-sm truncate text-foreground">{acc.name}</p>
                                      <p className="text-xs text-muted-foreground/70 truncate">{accountTypeLabels[acc.type]} · {group.currency.code}</p>
                                  </div>
                             </div>
                             
                             <div className="flex items-center gap-6 sm:justify-end text-right">
                                 <div className="flex flex-col text-sm font-bold items-end min-w-[80px]">
                                     <span className={cn(acc.balance < 0 ? "text-expense" : "")}>
                                         {formatMoney(acc.balance, group.currency)}
                                     </span>
                                 </div>
                             </div>
                         </div>
                     );
                 })}
             </SimpleAccordion>
         ))}

         {groupedAccounts.length === 0 && (
             <div className="text-center py-10 bg-accent/10 border border-dashed rounded-xl">
                 <p className="text-sm text-muted-foreground">Aún no hay billeteras cargadas.</p>
             </div>
         )}
      </div>
    </div>
  );
}
