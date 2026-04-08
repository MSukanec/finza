'use client';

import type { Transaction } from '@/lib/types';
import { useFinanceStore } from '@/stores/finance-store';
import { formatMoney, getAmountColorClass } from '@/lib/money';
import { getIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Trash2, CheckCircle2, CheckSquare, Flag, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface TransactionListProps {
  transactions: Transaction[];
  onEdit?: (tx: Transaction) => void;
}

export function TransactionList({ transactions, onEdit }: TransactionListProps) {
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const currencies = useFinanceStore((s) => s.currencies);
  const removeTransaction = useFinanceStore((s) => s.removeTransaction);
  const toggleCheckpoint = useFinanceStore((s) => s.toggleCheckpoint);
  const toggleTransactionStatus = useFinanceStore((s) => s.toggleTransactionStatus);
  const [swipedId, setSwipedId] = useState<string | null>(null);

  const grouped = groupByDate(transactions);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'income': return ArrowDownLeft;
      case 'expense': return ArrowUpRight;
      case 'transfer': return ArrowLeftRight;
      default: return ArrowUpRight;
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/50 flex items-center justify-center mb-4">
          <ArrowLeftRight className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Sin movimientos encontrados</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([dateLabel, txs]) => (
        <div key={dateLabel}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            {dateLabel}
          </p>
          <div className="space-y-1">
            {txs.map((tx) => {
              const category = categories.find((c) => c.id === tx.category_id);
              const currency = currencies.find((c) => c.id === tx.currency_id) || currencies[0];
              const account = accounts.find((a) => a.id === tx.account_id);
              const TypeIcon = getTypeIcon(tx.type);
              const CategoryIcon = category?.icon ? getIcon(category.icon) : TypeIcon;
              const isReviewed = tx.status === 'reviewed';
              const isWarning = tx.status === 'warning';

              const getNextStatus = (current: string) => {
                if (current === 'draft') return 'reviewed';
                if (current === 'reviewed') return 'warning';
                return 'draft';
              };

              return (
                <div key={tx.id} className="relative space-y-1">
                  
                  {/* Visual Checkpoint Separator */}
                  {tx.is_checkpoint && (
                    <div className="flex items-center gap-3 py-4 opacity-90 my-2">
                       <div className="h-px bg-emerald-500/40 flex-1"></div>
                       <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-sm">
                         <Flag className="w-3.5 h-3.5" />
                         Revisado hasta aquí
                       </div>
                       <div className="h-px bg-emerald-500/40 flex-1"></div>
                    </div>
                  )}

                  <div className={cn("relative group transition-all", 
                    isReviewed ? "bg-emerald-500/5 rounded-xl border border-emerald-500/10 shadow-sm" : 
                    isWarning ? "bg-amber-500/5 rounded-xl border border-amber-500/10 shadow-sm" : ""
                  )}>
                    <div 
                      onClick={() => onEdit?.(tx)}
                      className="flex items-center gap-3 py-3 px-2 -mx-2 rounded-xl hover:bg-accent/30 transition-colors cursor-pointer"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${category?.color || '#6b7280'}20` }}
                      >
                        <CategoryIcon
                          className="w-5 h-5"
                          style={{ color: category?.color || '#6b7280' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.description}</p>
                        <div className="flex flex-col mt-0.5">
                          <p className="text-[11px] text-muted-foreground leading-snug truncate whitespace-normal break-words">
                            {category ? `${category.group_name || 'General'} > ${category.name}` : 'Transferencia'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className={cn('text-sm font-semibold', getAmountColorClass(0, tx.type))}>
                          {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}
                          {formatMoney(tx.amount, currency)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{account?.name || '---'}</p>
                      </div>

                      {/* Hover Actions */}
                      <div className={cn("flex items-center gap-1 transition-all", (isReviewed || isWarning) ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTransactionStatus(tx.id, getNextStatus(tx.status || 'draft'));
                          }}
                          className={cn("p-1.5 rounded-lg transition-all", 
                            isReviewed ? "text-emerald-600 hover:bg-emerald-500/10" : 
                            isWarning ? "text-amber-500 hover:bg-amber-500/10" :
                            "text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500"
                          )}
                          title="Cambiar Estado de Revisión"
                        >
                          {isWarning ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCheckpoint(tx.id, !!tx.is_checkpoint);
                          }}
                          className={cn("p-1.5 rounded-lg transition-all", tx.is_checkpoint ? "text-emerald-500 hover:bg-emerald-500/10" : "text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500", isReviewed ? "opacity-0 group-hover:opacity-100" : "")}
                          title="Fijar Hito de Control (Línea)"
                        >
                          <Flag className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTransaction(tx.id);
                          }}
                          className={cn("p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all", (isReviewed || isWarning) ? "opacity-0 group-hover:opacity-100" : "")}
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupByDate(transactions: Transaction[]): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  transactions.forEach((tx) => {
    const d = new Date(tx.date);
    const txDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    let label: string;
    if (txDate.getTime() === today.getTime()) {
      label = 'Hoy';
    } else if (txDate.getTime() === yesterday.getTime()) {
      label = 'Ayer';
    } else {
      label = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(tx);
  });

  return groups;
}
