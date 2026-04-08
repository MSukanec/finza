'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { formatMoney } from '@/lib/money';
import { getIcon } from '@/lib/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function AccountsOverview() {
  const accounts = useFinanceStore((s) => s.accounts);
  const currencies = useFinanceStore((s) => s.currencies);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base">Mis Cuentas</CardTitle>
        <Link
          href="/accounts"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Ver todas <ArrowRight className="w-3 h-3" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {accounts.map((account) => {
            const Icon = getIcon(account.icon);
            const currency = currencies.find((c) => c.id === account.currency_id) || currencies[0];

            return (
              <div
                key={account.id}
                className="p-3 rounded-xl bg-accent/30 hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${account.color}20` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: account.color }} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground truncate">{account.name}</p>
                <p className="text-sm font-semibold mt-0.5">
                  {formatMoney(account.balance, currency)}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
