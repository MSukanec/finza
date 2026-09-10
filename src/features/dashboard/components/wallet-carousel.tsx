'use client';

import Link from 'next/link';
import { useFinanceStore } from '@/stores/finance-store';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Banknote, Landmark, Plus, Smartphone, Wallet } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { Panel } from '@/components/ui/panel';

const TYPE_META = {
  cash: { icon: Banknote, label: 'Efectivo' },
  bank: { icon: Landmark, label: 'Banco' },
  digital: { icon: Smartphone, label: 'Digital' },
} as const;

export function WalletCarousel() {
  const accounts = useFinanceStore((s) => s.accounts);
  const currencies = useFinanceStore((s) => s.currencies);
  const openSheet = useUIStore((s) => s.openSheet);

  const sorted = [...accounts].sort((a, b) => b.balance - a.balance);

  return (
    <Panel
      icon={Wallet}
      title="Billeteras"
      description="Tu plata, por cuenta"
      actions={
        <Link
          href="/accounts"
          className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Ver todas
        </Link>
      }
    >
      {sorted.length === 0 ? (
        <button
          type="button"
          onClick={() => openSheet('new-account')}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-4 text-left transition-colors hover:bg-accent/50"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Wallet className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">Creá tu primera billetera</span>
            <span className="block text-xs text-muted-foreground">
              Efectivo, banco o cuenta digital.
            </span>
          </span>
        </button>
      ) : (
        /* Scroll horizontal con snap: el mismo componente sirve en mobile y desktop. */
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:-mx-5 md:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sorted.map((account, index) => {
            const currency = currencies.find((c) => c.id === account.currency_id) || currencies[0];
            const meta = TYPE_META[account.type] ?? TYPE_META.cash;
            const Icon = meta.icon;
            const featured = index === 0;

            return (
              <Link
                key={account.id}
                href="/accounts"
                className={cn(
                  'group relative flex min-w-[240px] max-w-[240px] snap-start flex-col justify-between rounded-3xl p-5 shadow-soft-sm transition-shadow hover:shadow-soft',
                  featured
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-card-foreground'
                )}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={cn(
                      'flex size-9 items-center justify-center rounded-xl',
                      featured ? 'bg-primary-foreground/15' : 'bg-accent text-accent-foreground'
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium uppercase tracking-wide',
                      featured ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    )}
                  >
                    {currency.code}
                  </span>
                </div>

                <div className="mt-8">
                  <p
                    className={cn(
                      'truncate text-xs',
                      featured ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    )}
                  >
                    {account.name}
                  </p>
                  <p className="mt-0.5 truncate text-xl font-semibold tracking-tight tabular-nums">
                    {formatMoney(account.balance, currency)}
                  </p>
                </div>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => openSheet('new-account')}
            aria-label="Nueva billetera"
            className="flex min-w-[120px] snap-start flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <Plus className="size-5" />
            <span className="text-xs font-medium">Nueva</span>
          </button>
        </div>
      )}
    </Panel>
  );
}
