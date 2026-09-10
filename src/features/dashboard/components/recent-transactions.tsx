'use client';

import Link from 'next/link';
import { useFinanceStore } from '@/stores/finance-store';
import { formatMoney } from '@/lib/money';
import { cn, parseLocalDate } from '@/lib/utils';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Receipt, HandCoins, Landmark } from 'lucide-react';
import { Panel } from '@/components/ui/panel';

const TYPE_ICON = {
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  transfer: ArrowLeftRight,
  // Los movimientos de socio llevan ícono y color propios: no son ni venta ni
  // costo, y leerlos como ingreso o gasto es el error que se quiso corregir.
  contribution: HandCoins,
  withdrawal: Landmark,
} as const;

const TYPE_CHIP = {
  income: 'bg-income/10 text-income',
  expense: 'bg-muted text-muted-foreground',
  transfer: 'bg-transfer/10 text-transfer',
  contribution: 'bg-primary/10 text-primary',
  withdrawal: 'bg-primary/10 text-primary',
} as const;

const AMOUNT_TONE = {
  income: 'text-income',
  expense: 'text-foreground',
  transfer: 'text-transfer',
  contribution: 'text-primary',
  withdrawal: 'text-primary',
} as const;

export function RecentTransactions() {
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const currencies = useFinanceStore((s) => s.currencies);

  const recent = [...transactions]
    .sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime())
    .slice(0, 6);

  return (
    <Panel
      icon={Receipt}
      title="Últimos movimientos"
      description="Lo más reciente que cargaste"
      actions={
        <Link
          href="/transactions"
          className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Ver todos
        </Link>
      }
    >
      {recent.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted">
            <Receipt className="size-5 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium">Sin movimientos todavía</p>
          <p className="mt-1 text-sm text-muted-foreground">Cargá el primero con el botón +.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {recent.map((tx) => {
            const type = (tx.type in TYPE_ICON ? tx.type : 'expense') as keyof typeof TYPE_ICON;
            const Icon = TYPE_ICON[type];
            const category = categories.find((c) => c.id === tx.category_id);
            const account = accounts.find((a) => a.id === tx.account_id);
            const currency = currencies.find((c) => c.id === tx.currency_id) || currencies[0];
            const title = tx.description?.trim() || category?.name || 'Transferencia';
            // El signo sigue a la caja: un aporte entra, un retiro sale.
            const sign =
              type === 'income' || type === 'contribution'
                ? '+'
                : type === 'expense' || type === 'withdrawal'
                  ? '−'
                  : '';

            return (
              <Link
                key={tx.id}
                href="/transactions"
                className="-mx-1 flex items-center gap-3 rounded-xl px-1 py-2 transition-colors hover:bg-accent/50"
              >
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full',
                    TYPE_CHIP[type]
                  )}
                >
                  <Icon className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium leading-tight">{title}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {account?.name || 'Sin billetera'}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      'text-[15px] font-semibold leading-tight tabular-nums',
                      AMOUNT_TONE[type]
                    )}
                  >
                    {sign} {formatMoney(tx.amount, currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {parseLocalDate(tx.date).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
