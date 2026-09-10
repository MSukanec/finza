'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { formatMoney } from '@/lib/money';
import { getIcon } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EXCHANGE_RATES } from '@/lib/mock-data';
import { Plus, TrendingUp, ChevronDown, ChevronRight, Wallet, Scale } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';
import { PageLayout } from '@/components/layout/page-layout';
import { Kpi } from '@/components/ui/panel';

// Native UI Accordion Helper Component (Same pattern used in Categories)
function SimpleAccordion({ title, summary, children, defaultOpen = false }: { title: React.ReactNode, summary: React.ReactNode, children: React.ReactNode, defaultOpen?: boolean }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    
    return (
        <div className="rounded-2xl overflow-hidden mb-3 bg-card shadow-soft-sm">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-accent/40 transition-colors text-left"
            >
                <div className="flex items-center gap-3">
                   {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                   {title}
                </div>
                <div>
                   {summary}
                </div>
            </button>
            {isOpen && (
                <div className="p-2 border-t border-border/60 space-y-0.5">
                    {children}
                </div>
            )}
        </div>
    );
}

export function AccountsView() {
  const reconciliations = useFinanceStore((s) => s.reconciliations);

  /** Último arqueo por billetera, para mostrarlo y para marcar pendientes. */
  const lastByWallet = useMemo(() => {
    const out = new Map<string, (typeof reconciliations)[number]>();
    for (const r of reconciliations) {
      const prev = out.get(r.wallet_id);
      if (!prev || new Date(r.counted_at) > new Date(prev.counted_at)) out.set(r.wallet_id, r);
    }
    return out;
  }, [reconciliations]);

  const hasPending = (walletId: string) =>
    reconciliations.some((r) => r.wallet_id === walletId && r.status === 'pending');

  /**
   * El arqueo pendiente de una billetera, si lo hay.
   *
   * Se devuelve entero y no una etiqueta: la fila necesita los NÚMEROS. Antes
   * sólo decía "Diferencia sin resolver", que avisa que algo no cierra y no
   * dice ni cuánto contaste ni cuánto falta — justo los dos datos por los que
   * uno mira esa fila.
   */
  const pendingOf = (walletId: string) =>
    reconciliations.find((r) => r.wallet_id === walletId && r.status === 'pending') ?? null;

  const lastCountLabel = (walletId: string) => {
    const last = lastByWallet.get(walletId);
    if (!last) return 'Sin arquear';
    const days = Math.round((Date.now() - +new Date(last.counted_at)) / 86400000);
    return days === 0 ? 'Arqueado hoy' : `Arqueado hace ${days} d`;
  };

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
         // El saldo de una billetera que agrupa YA incluye a sus subcuentas:
         // sumar las dos cosas contaría el efectivo dos veces.
         if (!acc.parent_id) group.total += acc.balance;
         group.accounts.push(acc);
     });

     // Cada subcuenta queda debajo de su madre, alfabético dentro de cada
     // nivel. El orden se arma acá y NO se vuelve a tocar después: un sort
     // alfabético plano posterior mezclaba las cajas con las billeteras de
     // arriba, y como las subcuentas van sangradas quedaban colgando de la que
     // les tocara al lado.
     const porNombre = (a: any, b: any) => a.name.localeCompare(b.name);
     for (const group of groupsMap.values()) {
         const raiz = group.accounts.filter((a) => !a.parent_id).sort(porNombre);
         const hijas = group.accounts.filter((a) => a.parent_id).sort(porNombre);
         group.accounts = raiz.flatMap((madre) => [
             madre,
             ...hijas.filter((h) => h.parent_id === madre.id),
         ]);
     }

     const groupsArray = Array.from(groupsMap.values());
     
     // Order groups: "ars" (Pesos) first, then "usd", then others. Then fallback to alphabetical.
     groupsArray.sort((a, b) => {
         if (a.currency.id === 'ars' && b.currency.id !== 'ars') return -1;
         if (a.currency.id !== 'ars' && b.currency.id === 'ars') return 1;
         if (a.currency.id === 'usd' && b.currency.id !== 'usd') return -1;
         if (a.currency.id !== 'usd' && b.currency.id === 'usd') return 1;
         return a.currency.name.localeCompare(b.currency.name);
     });

     return groupsArray;
  }, [accounts, currencies]);

  return (
    <PageLayout
      title="Billeteras"
      description="Tocá una billetera para editarla, o Arquear para registrar cuánta plata hay de verdad"
      icon={Wallet}
      actions={
        <Button size="sm" className="gap-2" onClick={() => openSheet('new-account')}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Nueva cuenta</span>
        </Button>
      }
    >

      <Kpi
        icon={TrendingUp}
        label="Patrimonio total unificado"
        value={formatMoney(totalBalance, primaryCurrency)}
        hint="Todas las billeteras convertidas a tu moneda base"
      />

      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
         {groupedAccounts.map(group => (
             <SimpleAccordion 
                key={group.currency.id}
                defaultOpen={true}
                title={
                    <div className="flex items-center gap-2">
                       <Wallet className="size-4 text-muted-foreground" />
                       <span className="font-semibold text-xs tracking-wide uppercase text-muted-foreground">Cuentas en {group.currency.name}</span>
                    </div>
                }
                summary={
                   <div className={cn("font-semibold text-sm tabular-nums", group.total < 0 ? "text-expense" : "")}>
                       {formatMoney(group.total, group.currency)}
                   </div>
                }
             >
                 {group.accounts.map(acc => {
                     const Icon = getIcon(acc.icon);
                     return (
                         <div
                             key={acc.id}
                             onClick={() => openSheet('edit-account', { account: acc })}
                             className={cn(
                                 "group flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl hover:bg-accent/50 cursor-pointer transition-colors",
                                 // La subcuenta se sangra para que se lea que
                                 // cuelga de la de arriba y no es una más.
                                 acc.parent_id && "ml-5 border-l border-border/60 rounded-l-none pl-4"
                             )}
                         >
                             <div className="flex items-center gap-3.5 min-w-0 flex-1 mb-2 sm:mb-0">
                                 <div className="flex size-10 items-center justify-center rounded-xl shrink-0 bg-accent text-accent-foreground transition-transform group-hover:scale-105">
                                    <Icon className="size-5" />
                                  </div>
                                  <div className="min-w-0">
                                      <p className="font-medium text-sm truncate text-foreground">{acc.name}</p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {acc.isGroup
                                          ? `Suma de ${group.accounts.filter((h: any) => h.parent_id === acc.id).length} cajas`
                                          : `${accountTypeLabels[acc.type]} · ${group.currency.code}`}
                                      </p>
                                  </div>
                             </div>

                             <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 text-right">
                                 {/* Dos números distintos y hay que decir cuál es cuál:
                                     arriba SIEMPRE el saldo que calculó la app, y la línea
                                     de abajo lo aclara. Antes decía "Arqueado hoy" debajo
                                     del saldo, así que ese número se leía como si fuera lo
                                     que la persona había contado. */}
                                 <div className="flex min-w-[80px] flex-col items-end text-sm font-semibold tabular-nums">
                                     <span className={cn(acc.balance < 0 ? "text-expense" : "")}>
                                         {formatMoney(acc.balance, group.currency)}
                                     </span>
                                     <span className="text-[10px] font-normal text-muted-foreground">
                                        {acc.isGroup
                                          ? 'Se arquea por caja'
                                          : pendingOf(acc.id)
                                            ? 'Según la app'
                                            : lastCountLabel(acc.id)}
                                     </span>
                                 </div>

                                 {/* Lo que se contó y la diferencia, con NÚMEROS. Antes la
                                     fila sólo decía "Diferencia sin resolver": avisaba que
                                     algo no cerraba y no decía ni cuánto se contó ni cuánto
                                     falta, que son los dos datos por los que uno mira. */}
                                 {(() => {
                                     const pend = pendingOf(acc.id);
                                     if (!pend) return null;
                                     const diff = pend.counted_amount - pend.expected_amount;
                                     return (
                                         <div className={cn(
                                             'flex shrink-0 flex-col items-end rounded-lg px-2.5 py-1 text-xs tabular-nums',
                                             diff < 0 ? 'bg-expense/12 text-expense' : 'bg-income/12 text-income'
                                         )}>
                                             <span className="font-semibold">
                                                 {formatMoney(pend.counted_amount, group.currency)}
                                             </span>
                                             <span className="text-[10px] opacity-90">
                                                 contado · {diff < 0 ? 'faltan ' : 'sobran '}
                                                 {formatMoney(Math.abs(diff), group.currency)}
                                             </span>
                                         </div>
                                     );
                                 })()}

                                 {/* Arqueo es una acción propia y separada de editar la
                                     billetera: registrar cuánto hay hoy no es lo mismo que
                                     cambiar con cuánto se arrancó.
                                     Una billetera que agrupa no se arquea: no hay
                                     una caja que contar, hay tres. */}
                                 {!acc.isGroup && (
                                 <button
                                     onClick={(e) => {
                                         e.stopPropagation();
                                         openSheet('reconcile-wallet', { walletId: acc.id });
                                     }}
                                     title="Contar la plata real y compararla con la app"
                                     className={cn(
                                        'flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition-colors',
                                        hasPending(acc.id)
                                            ? 'border-expense/30 bg-expense/10 text-expense hover:bg-expense/20'
                                            : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                                     )}
                                 >
                                     <Scale className="size-4" />
                                     <span className="hidden sm:inline">
                                        {hasPending(acc.id) ? 'Resolver' : 'Arquear'}
                                     </span>
                                 </button>
                                 )}
                             </div>
                         </div>
                     );
                 })}
             </SimpleAccordion>
         ))}

         {groupedAccounts.length === 0 && (
             <div className="text-center py-12 border border-dashed border-border rounded-2xl">
                 <p className="text-sm text-muted-foreground">Aún no hay billeteras cargadas.</p>
             </div>
         )}
      </div>
    </PageLayout>
  );
}
