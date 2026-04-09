'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { formatMoney, getAmountColorClass } from '@/lib/money';
import { getIcon } from '@/lib/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import { cn, parseLocalDate } from '@/lib/utils';

export function RecentTransactions() {
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const currencies = useFinanceStore((s) => s.currencies);

  const recent = transactions.slice(0, 5);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'income': return ArrowDownLeft;
      case 'expense': return ArrowUpRight;
      case 'transfer': return ArrowLeftRight;
      default: return ArrowUpRight;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = parseLocalDate(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    if (diff < 7) return `hace ${diff} días`;
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base">Últimos Movimientos</CardTitle>
        <Link
          href="/transactions"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Ver todos <ArrowRight className="w-3 h-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sin movimientos</p>
        ) : (
          recent.map((tx) => {
            const category = categories.find((c) => c.id === tx.category_id);
            const currency = currencies.find((c) => c.id === tx.currency_id) || currencies[0];
            const TypeIcon = getTypeIcon(tx.type);
            const CategoryIcon = category?.icon ? getIcon(category.icon) : TypeIcon;

            return (
              <div
                key={tx.id}
                className="flex items-center gap-3 py-2.5 rounded-lg hover:bg-accent/50 px-2 -mx-2 transition-colors cursor-pointer"
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
                  <p className="text-[15px] sm:text-base font-medium truncate text-foreground">
                    {category ? `${category.group_name || 'General'} > ${category.name}` : 'Transferencia'}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">
                    {tx.description}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className={cn('text-[15px] sm:text-base font-semibold', getAmountColorClass(0, tx.type))}>
                    {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}
                    {formatMoney(tx.amount, currency)}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{formatDate(tx.date)}</p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
