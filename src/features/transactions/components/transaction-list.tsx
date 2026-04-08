'use client';

import type { Transaction } from '@/lib/types';
import { useFinanceStore } from '@/stores/finance-store';
import { formatMoney, getAmountColorClass } from '@/lib/money';
import { getIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Trash2 } from 'lucide-react';
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

              return (
                <div
                  key={tx.id}
                  className="relative group"
                >
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
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {category?.name || 'Transferencia'}
                        </p>
                        {account && <span className="text-[10px] uppercase font-medium bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                          {account.name}
                        </span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn('text-sm font-semibold', getAmountColorClass(0, tx.type))}>
                        {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}
                        {formatMoney(tx.amount, currency)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{currency.code}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTransaction(tx.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
