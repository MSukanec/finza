'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFinanceStore } from '@/stores/finance-store';
import { useUIStore } from '@/stores/ui-store';
import { PageLayout } from '@/components/layout/page-layout';
import { Panel, Kpi } from '@/components/ui/panel';
import { formatMoney } from '@/lib/money';
import { cn, parseLocalDate } from '@/lib/utils';
import type { Transaction } from '@/lib/types';
import { CalendarClock, AlertTriangle, Wallet, TrendingDown, CheckCircle2 } from 'lucide-react';

const DIA = 86400000;

/**
 * Lo que está comprometido y todavía no salió.
 *
 * Un cheque a 60 días es plata que ya no es tuya aunque siga en la cuenta. La
 * pregunta que contesta esta pantalla es "¿llego?": cuánto sale cada semana y
 * si el saldo alcanza.
 */
export function PaymentsView() {
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const currencies = useFinanceStore((s) => s.currencies);
  const openSheet = useUIStore((s) => s.openSheet);
  const currency = currencies[0];

  const [ahora, setAhora] = useState(() => Date.now());
  // La página puede quedar abierta días: sin esto los "vence en 3 días" se
  // congelan en el momento en que se cargó.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { pendientes, vencidos, total, en30, disponible } = useMemo(() => {
    const conFecha = transactions.filter((t) => t.settles_at);

    const pendientes = conFecha
      .filter((t) => +new Date(t.settles_at!) > ahora)
      .sort((a, b) => +new Date(a.settles_at!) - +new Date(b.settles_at!));

    // Pasó la fecha y sigue marcado como no liquidado: o se cobró y nadie lo
    // registró, o hay que reclamarlo. En los dos casos hay que mirarlo.
    const vencidos = conFecha
      .filter((t) => +new Date(t.settles_at!) <= ahora && +new Date(t.settles_at!) > ahora - 7 * DIA)
      .sort((a, b) => +new Date(b.settles_at!) - +new Date(a.settles_at!));

    const salida = (t: Transaction) =>
      t.type === 'expense' || t.type === 'withdrawal' ? Number(t.amount) : -Number(t.amount);

    return {
      pendientes,
      vencidos,
      total: pendientes.reduce((s, t) => s + salida(t), 0),
      en30: pendientes
        .filter((t) => +new Date(t.settles_at!) <= ahora + 30 * DIA)
        .reduce((s, t) => s + salida(t), 0),
      disponible: accounts.reduce((s, a) => s + a.balance, 0),
    };
  }, [transactions, accounts, ahora]);

  // Agrupados por semana: es la unidad en la que se piensa un pago.
  const porSemana = useMemo(() => {
    const grupos = new Map<string, { desde: Date; movs: Transaction[] }>();
    for (const t of pendientes) {
      const d = parseLocalDate(t.settles_at!);
      const lunes = new Date(d);
      lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      lunes.setHours(0, 0, 0, 0);
      const k = lunes.toISOString();
      const g = grupos.get(k);
      if (g) g.movs.push(t);
      else grupos.set(k, { desde: lunes, movs: [t] });
    }
    return [...grupos.values()];
  }, [pendientes]);

  const alcanza = disponible >= en30;

  return (
    <PageLayout
      title="Pagos programados"
      description="Cheques y pagos a plazo que todavía no salieron"
      icon={CalendarClock}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={TrendingDown}
          label="Comprometido"
          value={formatMoney(total, currency)}
          hint={`${pendientes.length} ${pendientes.length === 1 ? 'pago' : 'pagos'} sin salir`}
          tone="expense"
        />
        <Kpi
          icon={CalendarClock}
          label="Sale en 30 días"
          value={formatMoney(en30, currency)}
          hint="Lo más cercano"
          tone="expense"
        />
        <Kpi
          icon={Wallet}
          label="Tenés hoy"
          value={formatMoney(disponible, currency)}
          hint="Suma de las billeteras"
          tone="income"
        />
        <Kpi
          icon={alcanza ? CheckCircle2 : AlertTriangle}
          label="Después de pagar"
          value={formatMoney(disponible - en30, currency)}
          hint={alcanza ? 'Alcanza' : 'No alcanza'}
          tone={alcanza ? 'income' : 'expense'}
        />
      </div>

      {!alcanza && pendientes.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-expense/10 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-expense/15 text-expense">
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              Faltan {formatMoney(en30 - disponible, currency)} para cubrir los próximos 30 días
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Entre hoy y dentro de un mes salen {formatMoney(en30, currency)} y en las billeteras
              hay {formatMoney(disponible, currency)}. Conviene mirarlo ahora y no la semana que
              cae el cheque.
            </p>
          </div>
        </div>
      )}

      {vencidos.length > 0 && (
        <Panel
          icon={AlertTriangle}
          title="Vencieron esta semana"
          description="Confirmá que se hayan cobrado"
        >
          <ul className="divide-y divide-border/60">
            {vencidos.map((t) => (
              <Fila key={t.id} tx={t} currency={currency} accounts={accounts} ahora={ahora} onEdit={() => openSheet('edit-transaction', { transaction: t })} />
            ))}
          </ul>
        </Panel>
      )}

      {pendientes.length === 0 ? (
        <Panel icon={CalendarClock} title="Sin pagos programados">
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay cheques ni pagos a plazo pendientes. Cuando cargues un movimiento con fecha de
            pago distinta a la del hecho, aparece acá.
          </p>
        </Panel>
      ) : (
        porSemana.map((g) => {
          const suma = g.movs.reduce(
            (s, t) => s + (t.type === 'expense' || t.type === 'withdrawal' ? Number(t.amount) : -Number(t.amount)),
            0
          );
          return (
            <Panel
              key={+g.desde}
              icon={CalendarClock}
              title={tituloSemana(g.desde, ahora)}
              description={`${g.movs.length} ${g.movs.length === 1 ? 'pago' : 'pagos'}`}
              actions={
                <span className="text-sm font-semibold tabular-nums text-expense">
                  {formatMoney(suma, currency)}
                </span>
              }
            >
              <ul className="divide-y divide-border/60">
                {g.movs.map((t) => (
                  <Fila key={t.id} tx={t} currency={currency} accounts={accounts} ahora={ahora} onEdit={() => openSheet('edit-transaction', { transaction: t })} />
                ))}
              </ul>
            </Panel>
          );
        })
      )}
    </PageLayout>
  );
}

function tituloSemana(lunes: Date, ahora: number): string {
  const dias = Math.round((+lunes - ahora) / DIA);
  if (dias <= 0) return 'Esta semana';
  if (dias <= 7) return 'La semana que viene';
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  return `${f(lunes)} — ${f(domingo)}`;
}

function Fila({
  tx,
  currency,
  accounts,
  ahora,
  onEdit,
}: {
  tx: Transaction;
  currency: any;
  accounts: { id: string; name: string }[];
  ahora: number;
  onEdit: () => void;
}) {
  const cuando = parseLocalDate(tx.settles_at!);
  const dias = Math.ceil((+cuando - ahora) / DIA);
  const billetera = accounts.find((a) => a.id === tx.account_id)?.name;
  const salida = tx.type === 'expense' || tx.type === 'withdrawal';

  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-center gap-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            'flex size-9 shrink-0 flex-col items-center justify-center rounded-xl text-[10px] font-semibold leading-none',
            dias <= 0 ? 'bg-expense/15 text-expense' : dias <= 7 ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'
          )}
        >
          <span className="text-[13px]">{cuando.getDate()}</span>
          <span className="mt-0.5 uppercase">
            {cuando.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-tight">
            {tx.description?.trim() || (salida ? 'Pago' : 'Cobro')}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>
              {dias < 0 ? `venció hace ${-dias} d` : dias === 0 ? 'vence hoy' : `en ${dias} d`}
            </span>
            {billetera && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{billetera}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span className="truncate">
              del {parseLocalDate(tx.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
            </span>
          </span>
        </span>

        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', salida ? 'text-expense' : 'text-income')}>
          {salida ? '−' : '+'} {formatMoney(tx.amount, currency)}
        </span>
      </button>
    </li>
  );
}
