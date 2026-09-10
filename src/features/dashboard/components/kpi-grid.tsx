'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFinanceStore } from '@/stores/finance-store';
import { EXCHANGE_RATES } from '@/lib/mock-data';
import { formatMoney } from '@/lib/money';
import { parseLocalDate, cn } from '@/lib/utils';
import { Eye, EyeOff, TrendingDown, TrendingUp, Wallet, Scale } from 'lucide-react';
import { Kpi } from '@/components/ui/panel';

const HIDE_KEY = 'finza:hide-balance';
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** KPIs del inicio. Números, sin gráficos: el análisis vive en Reportes. */
export function KpiGrid() {
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const currencies = useFinanceStore((s) => s.currencies);
  const primaryCurrencyId = useFinanceStore((s) => s.primaryCurrencyId);

  const [hidden, setHidden] = useState(false);

  // Después del montaje para no romper la hidratación con el valor guardado.
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === '1');
    } catch {
      /* storage bloqueado: se queda visible */
    }
  }, []);

  const toggle = () =>
    setHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(HIDE_KEY, next ? '1' : '0');
      } catch {
        /* ignorado a propósito */
      }
      return next;
    });

  const currency = currencies.find((c) => c.id === primaryCurrencyId) || currencies[0];

  const stats = useMemo(() => {
    const toPrimary = (amount: number, currencyId: string) => {
      const rate = EXCHANGE_RATES[currencyId] || 1;
      const primaryRate = EXCHANGE_RATES[primaryCurrencyId] || 1;
      return (amount * rate) / primaryRate;
    };

    const balance = accounts.reduce((s, a) => s + toPrimary(a.balance, a.currency_id), 0);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    let income = 0;
    let expense = 0;
    let prevIncome = 0;
    let prevExpense = 0;

    for (const t of transactions) {
      const d = parseLocalDate(t.date);
      const v = toPrimary(t.amount, t.currency_id);
      if (d >= startOfMonth) {
        if (t.type === 'income') income += v;
        else if (t.type === 'expense') expense += v;
      } else if (d >= startOfPrev) {
        if (t.type === 'income') prevIncome += v;
        else if (t.type === 'expense') prevExpense += v;
      }
    }

    // Lo que ya está comprometido y sale en el próximo mes: cheques y pagos a
    // plazo. Es plata que sigue en la billetera pero ya no es tuya.
    const en30 = transactions.reduce((s, t) => {
      if (!t.settles_at) return s;
      const cuando = +parseLocalDate(t.settles_at);
      if (cuando <= +now || cuando > +now + 30 * 86400000) return s;
      const v = toPrimary(t.amount, t.currency_id);
      return s + (t.type === 'expense' || t.type === 'withdrawal' ? v : -v);
    }, 0);

    const delta = (curr: number, prev: number) =>
      prev > 0 ? ((curr - prev) / prev) * 100 : null;

    return {
      balance,
      comprometido: en30,
      income,
      expense,
      net: income - expense,
      deltaIncome: delta(income, prevIncome),
      deltaExpense: delta(expense, prevExpense),
      monthLabel: `${MES[now.getMonth()]} ${now.getFullYear()}`,
    };
  }, [transactions, accounts, primaryCurrencyId]);

  const mask = (v: string) => (hidden ? '•'.repeat(Math.min(v.length, 10)) : v);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        icon={Wallet}
        label="Balance total"
        value={mask(formatMoney(stats.balance, currency))}
        hint={
          stats.comprometido > 0
            ? `Menos ${formatMoney(stats.comprometido, currency)} ya comprometidos`
            : 'Suma de todas tus billeteras'
        }
        action={
          <button
            type="button"
            onClick={toggle}
            aria-label={hidden ? 'Mostrar saldos' : 'Ocultar saldos'}
            aria-pressed={hidden}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        }
      />

      <Kpi
        icon={TrendingUp}
        label="Ingresos"
        value={mask(formatMoney(stats.income, currency))}
        hint={stats.monthLabel}
        tone="income"
        delta={stats.deltaIncome}
      />

      <Kpi
        icon={TrendingDown}
        label="Egresos"
        value={mask(formatMoney(stats.expense, currency))}
        hint={stats.monthLabel}
        tone="expense"
        delta={stats.deltaExpense}
        deltaInverted
      />

      <Kpi
        icon={Scale}
        label="Resultado del mes"
        value={mask(formatMoney(stats.net, currency))}
        hint={stats.net >= 0 ? 'Cerrás en positivo' : 'Gastaste más de lo que entró'}
        tone={stats.net >= 0 ? 'income' : 'expense'}
      />
    </div>
  );
}
