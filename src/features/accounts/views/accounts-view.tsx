'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { formatMoney } from '@/lib/money';
import { getIcon } from '@/lib/icons';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EXCHANGE_RATES } from '@/lib/mock-data';
import { Plus, Wallet, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { useUIStore } from '@/stores/ui-store';

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cuentas</h1>
        <Button size="sm" className="gap-2" onClick={() => openSheet('new-account')}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva Cuenta</span>
        </Button>
      </div>

      {/* Total */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/15 p-5">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Patrimonio Total</p>
          </div>
          <p className="text-2xl md:text-3xl font-bold animate-count-up">
            {formatMoney(totalBalance, primaryCurrency)}
          </p>
        </div>
      </div>

      {/* Account Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-children">
        {accounts.map((account) => {
          const Icon = getIcon(account.icon);
          const currency = currencies.find((c) => c.id === account.currency_id) || currencies[0];

          return (
            <Card
              key={account.id}
              className="border-border/50 hover:border-border transition-colors cursor-pointer group"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                      style={{ backgroundColor: `${account.color}20` }}
                    >
                      <Icon className="w-6 h-6" style={{ color: account.color }} />
                    </div>
                    <div>
                      <p className="font-semibold">{account.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {accountTypeLabels[account.type]} · {currency.code}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-0.5">Balance</p>
                  <p className={`text-xl font-bold ${account.balance < 0 ? 'text-expense' : ''}`}>
                    {formatMoney(account.balance, currency)}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
