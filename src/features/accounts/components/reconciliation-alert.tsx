'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useFinanceStore } from '@/stores/finance-store';
import { useUIStore } from '@/stores/ui-store';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { AlertTriangle, Scale, ArrowRight } from 'lucide-react';

const DIAS_SIN_ARQUEO = 30;

/**
 * Aviso proactivo: la app no espera a que alguien se acuerde de revisar.
 *
 * Dos casos, en este orden de urgencia:
 *  1. Hay una diferencia sin resolver — plata que no cuadra.
 *  2. Hace mucho que no se arquea una billetera — la diferencia todavía no se
 *     detectó, y cuanto más tarde se detecte más difícil es rastrearla.
 */
export function ReconciliationAlert() {
  const accounts = useFinanceStore((s) => s.accounts);
  const currencies = useFinanceStore((s) => s.currencies);
  const reconciliations = useFinanceStore((s) => s.reconciliations);
  const openSheet = useUIStore((s) => s.openSheet);

  const { pending, stale } = useMemo(() => {
    const pending = reconciliations.filter((r) => r.status === 'pending');

    const lastByWallet = new Map<string, string>();
    for (const r of reconciliations) {
      const prev = lastByWallet.get(r.wallet_id);
      if (!prev || new Date(r.counted_at) > new Date(prev)) {
        lastByWallet.set(r.wallet_id, r.counted_at);
      }
    }

    const stale = accounts.filter((a) => {
      // Una billetera que agrupa no se arquea: no hay una caja que contar, hay
      // varias. Sin esto aparecería siempre como "nunca arqueada".
      if (a.isGroup) return false;
      const last = lastByWallet.get(a.id);
      if (!last) return true; // nunca se arqueó
      return (Date.now() - +new Date(last)) / 86400000 > DIAS_SIN_ARQUEO;
    });

    return { pending, stale };
  }, [reconciliations, accounts]);

  if (pending.length === 0 && stale.length === 0) return null;

  if (pending.length > 0) {
    const total = pending.reduce((s, r) => s + Math.abs(r.counted_amount - r.expected_amount), 0);
    const currency = currencies[0];

    return (
      <Banner tone="expense" icon={AlertTriangle}>
        <p className="text-sm font-medium">
          {pending.length === 1
            ? 'Hay un arqueo con una diferencia sin resolver'
            : `Hay ${pending.length} arqueos con diferencias sin resolver`}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          En total no cuadran {formatMoney(total, currency)}. Conviene resolverlo mientras el
          período esté fresco.
        </p>
        <Link
          href="/accounts"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Ver billeteras
          <ArrowRight className="size-3.5" />
        </Link>
      </Banner>
    );
  }

  const first = stale[0];
  return (
    <Banner tone="warning" icon={Scale}>
      <p className="text-sm font-medium">
        {stale.length === 1
          ? `Hace rato que no se controla «${first.name}»`
          : `Hay ${stale.length} billeteras sin controlar hace rato`}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Contar la plata real y compararla con la app es lo que detecta movimientos que quedaron sin
        cargar.
      </p>
      <button
        onClick={() => openSheet('reconcile-wallet', { walletId: first.id })}
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Arquear «{first.name}»
        <ArrowRight className="size-3.5" />
      </button>
    </Banner>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'expense' | 'warning';
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl p-4',
        tone === 'expense' ? 'bg-expense/10' : 'bg-warning/10'
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl',
          tone === 'expense' ? 'bg-expense/15 text-expense' : 'bg-warning/15 text-warning'
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
