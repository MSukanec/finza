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

  // Group accounts by currency
  const groupedAccounts = accounts.reduce((acc, account) => {
    const currency = currencies.find((c) => c.id === account.currency_id) || currencies[0];
    const code = currency.code.toUpperCase();
    if (!acc[code]) acc[code] = { currency, accounts: [] };
    acc[code].accounts.push(account);
    return acc;
  }, {} as Record<string, { currency: any; accounts: typeof accounts }>);

  // Sort groups (optional, though there's usually just ARS and USD)
  const groups = Object.values(groupedAccounts);
  // Sort accounts alphabetically within each group
  groups.forEach(group => {
    group.accounts.sort((a, b) => a.name.localeCompare(b.name));
  });

  return (
    <Card className="border-border/50 flex flex-col h-full">
      <CardHeader className="pb-2 flex-row items-center justify-between shrink-0">
        <CardTitle className="text-base">Mis Cuentas</CardTitle>
        <Link
          href="/accounts"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Ver todas <ArrowRight className="w-3 h-3" />
        </Link>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          {groups.map((group) => (
            <div key={group.currency.id} className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 border-b border-border/50 pb-1">
                {group.currency.name}
              </h4>
              <div className="space-y-1.5">
                {group.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex flex-col p-2 rounded-lg bg-accent/20 border border-transparent hover:border-border/50 hover:bg-accent/40 transition-colors cursor-pointer"
                  >
                    <p className="text-[11px] text-muted-foreground truncate leading-tight">{account.name}</p>
                    <p className="text-sm font-semibold truncate">
                      {formatMoney(account.balance, group.currency)}
                    </p>
                  </div>
                ))}
                {group.accounts.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">Sin cuentas</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
