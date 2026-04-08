'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { formatMoney } from '@/lib/money';
import { EXCHANGE_RATES } from '@/lib/mock-data';
import { TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react';
import { useMemo } from 'react';

export function BalanceCard() {
  const accounts = useFinanceStore((s) => s.accounts);
  const transactions = useFinanceStore((s) => s.transactions);
  const currencies = useFinanceStore((s) => s.currencies);
  const primaryCurrencyId = useFinanceStore((s) => s.primaryCurrencyId);

  const primaryCurrency = currencies.find((c) => c.id === primaryCurrencyId) || currencies[0];

  const stats = useMemo(() => {
    // Total balance across all accounts (converted to primary currency)
    const totalBalance = accounts.reduce((sum, acc) => {
      const rate = EXCHANGE_RATES[acc.currency_id] || 1;
      const primaryRate = EXCHANGE_RATES[primaryCurrencyId] || 1;
      return sum + (acc.balance * rate) / primaryRate;
    }, 0);

    // This month's income/expense
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTransactions = transactions.filter(
      (t) => new Date(t.date) >= startOfMonth
    );

    const monthIncome = monthTransactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => {
        const rate = EXCHANGE_RATES[t.currency_id] || 1;
        const primaryRate = EXCHANGE_RATES[primaryCurrencyId] || 1;
        return sum + (t.amount * rate) / primaryRate;
      }, 0);

    const monthExpense = monthTransactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => {
        const rate = EXCHANGE_RATES[t.currency_id] || 1;
        const primaryRate = EXCHANGE_RATES[primaryCurrencyId] || 1;
        return sum + (t.amount * rate) / primaryRate;
      }, 0);

    return { totalBalance, monthIncome, monthExpense };
  }, [accounts, transactions, primaryCurrencyId]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 p-6">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative">
        <p className="text-sm text-muted-foreground font-medium mb-1">Balance Total</p>
        <p className="text-3xl md:text-4xl font-bold tracking-tight animate-count-up">
          {formatMoney(stats.totalBalance, primaryCurrency)}
        </p>

        <div className="flex flex-wrap gap-4 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-income/15 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-income" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ingresos</p>
              <p className="text-sm font-semibold text-income">
                {formatMoney(stats.monthIncome, primaryCurrency, { showSign: true })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-expense/15 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-expense" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gastos</p>
              <p className="text-sm font-semibold text-expense">
                {formatMoney(-stats.monthExpense, primaryCurrency, { showSign: true })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <ArrowUpDown className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Neto</p>
              <p className="text-sm font-semibold">
                {formatMoney(stats.monthIncome - stats.monthExpense, primaryCurrency, { showSign: true })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
