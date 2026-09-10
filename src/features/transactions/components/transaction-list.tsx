'use client';

import type { Transaction } from '@/lib/types';
import { useFinanceStore } from '@/stores/finance-store';
import { esMovimientoDeSocio } from '@/lib/money';
import { formatMoney } from '@/lib/money';
import { cn, parseLocalDate } from '@/lib/utils';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Trash2,
  CheckCircle2,
  Flag,
  AlertTriangle,
  Receipt,
  HandCoins,
  Landmark,
} from 'lucide-react';
import { useGlobalDialog } from '@/components/providers/dialog-provider';
import { UserAvatar, personName } from '@/components/ui/user-avatar';

interface TransactionListProps {
  transactions: Transaction[];
  onEdit?: (tx: Transaction) => void;
}

const TYPE_ICON = {
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  transfer: ArrowLeftRight,
  // Los movimientos de socio llevan ícono propio: no son ni venta ni costo, y
  // confundirlos visualmente con un ingreso o un gasto es justo el error que se
  // quiso sacar del sistema.
  contribution: HandCoins,
  withdrawal: Landmark,
} as const;

/** El chip del ícono: neutro y discreto, el color fuerte lo lleva el monto. */
const TYPE_CHIP = {
  income: 'bg-income/10 text-income',
  expense: 'bg-muted text-muted-foreground',
  transfer: 'bg-transfer/10 text-transfer',
  contribution: 'bg-primary/10 text-primary',
  withdrawal: 'bg-primary/10 text-primary',
} as const;

/** Colores semánticos: verde entra, rojo sale. Antes el egreso iba en tinta. */
const AMOUNT_TONE = {
  income: 'text-income',
  expense: 'text-expense',
  transfer: 'text-transfer',
  // Patrimonio, no resultado: se pintan con el color de marca para que no se
  // lean como si el negocio hubiera ganado o perdido plata.
  contribution: 'text-primary',
  withdrawal: 'text-primary',
} as const;

export function TransactionList({ transactions, onEdit }: TransactionListProps) {
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const currencies = useFinanceStore((s) => s.currencies);
  const removeTransaction = useFinanceStore((s) => s.removeTransaction);
  const toggleCheckpoint = useFinanceStore((s) => s.toggleCheckpoint);
  const toggleTransactionStatus = useFinanceStore((s) => s.toggleTransactionStatus);
  const people = useFinanceStore((s) => s.people);
  const dialog = useGlobalDialog();

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted mb-4">
          <Receipt className="size-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Todavía no hay movimientos</p>
        <p className="text-sm text-muted-foreground mt-1">Los que cargues van a aparecer acá.</p>
      </div>
    );
  }

  const grouped = groupByDate(transactions);

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([dateLabel, txs]) => (
        <section key={dateLabel}>
          <h3 className="text-xs font-medium text-muted-foreground mb-2 px-1">{dateLabel}</h3>

          <div className="space-y-2">
            {txs.map((tx) => {
              const type = (tx.type in TYPE_ICON ? tx.type : 'expense') as keyof typeof TYPE_ICON;
              const Icon = TYPE_ICON[type];
              const category = categories.find((c) => c.id === tx.category_id);
              const currency = currencies.find((c) => c.id === tx.currency_id) || currencies[0];
              const account = accounts.find((a) => a.id === tx.account_id);
              const author = tx.user_id ? people[tx.user_id] : undefined;
              const isReviewed = tx.status === 'reviewed';
              const isWarning = tx.status === 'warning';

              // Arriba el "qué": la descripción si existe, si no la categoría.
              const title = tx.description?.trim() || category?.name || 'Transferencia';
              // El signo sigue a la caja: un aporte entra, un retiro sale.
              const sign =
                type === 'income' || type === 'contribution'
                  ? '+'
                  : type === 'expense' || type === 'withdrawal'
                    ? '−'
                    : '';

              const nextStatus =
                tx.status === 'draft' ? 'reviewed' : tx.status === 'reviewed' ? 'warning' : 'draft';

              return (
                <div key={tx.id}>
                  {tx.is_checkpoint && (
                    <div className="flex items-center gap-3 pb-3 pt-1">
                      <span className="h-px flex-1 bg-border" />
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-income/10 text-income px-2.5 py-1 text-[11px] font-medium">
                        <Flag className="size-3" />
                        Revisado hasta acá
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onEdit?.(tx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onEdit?.(tx);
                      }
                    }}
                    className={cn(
                      'group flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft-xs',
                      'cursor-pointer transition-shadow hover:shadow-soft-sm',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      isWarning && 'ring-1 ring-inset ring-expense/25'
                    )}
                  >
                    {/* Quién lo cargó. El tipo de movimiento se lee en el color
                        y el signo del monto, así que la flecha era redundante. */}
                    <span className="relative shrink-0">
                      <UserAvatar person={author} />
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full ring-2 ring-card',
                          isWarning ? 'bg-expense text-background' : TYPE_CHIP[type]
                        )}
                      >
                        {isWarning ? (
                          <AlertTriangle className="size-2.5" />
                        ) : (
                          <Icon className="size-2.5" />
                        )}
                      </span>
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium leading-tight">{title}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {isReviewed && <CheckCircle2 className="size-3 shrink-0 text-income" />}
                        <span className="truncate">{account?.name || 'Sin billetera'}</span>
                        {tx.reference && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="shrink-0 tabular-nums">{tx.reference}</span>
                          </>
                        )}
                        {author && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="truncate">{personName(author)}</span>
                          </>
                        )}
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
                        {formatShortDate(tx.date)}
                      </p>
                    </div>

                    {/* Acciones: solo en desktop, al pasar el mouse. En mobile se toca la fila. */}
                    <div className="hidden shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 md:flex">
                      <IconButton
                        label="Cambiar estado de revisión"
                        onClick={() => toggleTransactionStatus(tx.id, nextStatus)}
                        className={cn(
                          isReviewed && 'text-income',
                          isWarning && 'text-expense'
                        )}
                      >
                        {isWarning ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
                      </IconButton>
                      <IconButton
                        label="Fijar hito de control"
                        onClick={() => toggleCheckpoint(tx.id, !!tx.is_checkpoint)}
                        className={cn(tx.is_checkpoint && 'text-income')}
                      >
                        <Flag className="size-4" />
                      </IconButton>
                      <IconButton
                        label="Eliminar"
                        destructive
                        onClick={async () => {
                          const ok = await dialog.confirm(
                            'Eliminar movimiento',
                            '¿Seguro que querés eliminar este movimiento? No se puede deshacer.'
                          );
                          if (ok) await removeTransaction(tx.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  className,
  destructive,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'rounded-lg p-1.5 text-muted-foreground transition-colors',
        destructive ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-accent hover:text-accent-foreground',
        className
      )}
    >
      {children}
    </button>
  );
}

function formatShortDate(date: string) {
  const d = parseLocalDate(date);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function groupByDate(transactions: Transaction[]): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  transactions.forEach((tx) => {
    const d = parseLocalDate(tx.date);
    const txDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    let label: string;
    if (txDate.getTime() === today.getTime()) label = 'Hoy';
    else if (txDate.getTime() === yesterday.getTime()) label = 'Ayer';
    else label = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

    (groups[label] ||= []).push(tx);
  });

  return groups;
}
