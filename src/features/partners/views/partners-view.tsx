'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useFinanceStore } from '@/stores/finance-store';
import { useUIStore } from '@/stores/ui-store';
import { PageLayout } from '@/components/layout/page-layout';
import { Panel, Kpi } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { formatMoney } from '@/lib/money';
import { parseLocalDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { PartnerPosition, Transaction } from '@/lib/types';
import {
  Users,
  Plus,
  AlertTriangle,
  HandCoins,
  Landmark,
  Scale,
  Pencil,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';

/**
 * Qué pasa con la plata de cada socio.
 *
 * El número que importa es el SALDO: aportes menos retiros. Positivo significa
 * que el socio puso más de lo que sacó y el negocio le debe; negativo, que se
 * llevó más de lo que puso.
 *
 * Y el que evita discusiones es la comparación entre la participación y el
 * porcentaje de lo retirado: si alguien tiene el 15% del negocio pero se llevó
 * el 40% de todo lo retirado, acá se ve de una.
 */
export function PartnersView() {
  const partners = useFinanceStore((s) => s.partners);
  const currentWorkspaceId = useFinanceStore((s) => s.currentWorkspaceId);
  const loadPartnerPositions = useFinanceStore((s) => s.loadPartnerPositions);
  const currencies = useFinanceStore((s) => s.currencies);
  const people = useFinanceStore((s) => s.people);
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const openSheet = useUIStore((s) => s.openSheet);

  const [positions, setPositions] = useState<PartnerPosition[]>([]);
  // Uno por vez: abrir varios a la vez convierte la lista en una pared.
  const [abierto, setAbierto] = useState<string | null>(null);
  const currency = currencies[0];

  // Las posiciones las calcula la base: sumar aportes y retiros en el cliente
  // daría números distintos según qué movimientos estén cargados en memoria.
  useEffect(() => {
    if (!currentWorkspaceId) return;
    let vigente = true;
    loadPartnerPositions(currentWorkspaceId)
      .then((p) => vigente && setPositions(p))
      .catch(() => vigente && setPositions([]));
    return () => {
      vigente = false;
    };
  }, [currentWorkspaceId, loadPartnerPositions, partners]);

  // Los movimientos de cada socio ya están en memoria: se agrupan una vez en
  // vez de recorrer la lista entera por cada fila que se abra.
  const movimientosPorSocio = useMemo(() => {
    const mapa = new Map<string, Transaction[]>();
    for (const t of transactions) {
      if (!t.partner_id) continue;
      const lista = mapa.get(t.partner_id);
      if (lista) lista.push(t);
      else mapa.set(t.partner_id, [t]);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => +new Date(b.date) - +new Date(a.date));
    }
    return mapa;
  }, [transactions]);

  const totales = useMemo(() => {
    const aportes = positions.reduce((s, p) => s + p.aportes, 0);
    const retiros = positions.reduce((s, p) => s + p.retiros, 0);
    const pct = positions.reduce((s, p) => s + p.ownership_pct, 0);
    return { aportes, retiros, saldo: aportes - retiros, pct };
  }, [positions]);

  // Que la participación no sume 100 no es un error de la app: es un dato que
  // los socios todavía no terminaron de definir. Se avisa, no se bloquea.
  const pctIncompleto = positions.length > 0 && Math.abs(totales.pct - 100) > 0.01;

  return (
    <PageLayout
      title="Socios"
      description="Aportes, retiros y participación de cada uno"
      icon={Users}
      actions={
        <Button size="sm" className="gap-1.5" onClick={() => openSheet('new-partner')}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Nuevo socio</span>
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={HandCoins}
          label="Aportado"
          value={formatMoney(totales.aportes, currency)}
          hint="Plata que pusieron los socios"
          tone="income"
        />
        <Kpi
          icon={Landmark}
          label="Retirado"
          value={formatMoney(totales.retiros, currency)}
          hint="Plata que se llevaron"
          tone="expense"
        />
        <Kpi
          icon={Scale}
          label="Saldo"
          value={formatMoney(totales.saldo, currency)}
          hint={
            totales.saldo >= 0
              ? 'El negocio les debe'
              : 'Se retiró más de lo aportado'
          }
          tone={totales.saldo >= 0 ? 'income' : 'expense'}
        />
        <Kpi
          icon={Users}
          label="Participación"
          value={`${totales.pct.toLocaleString('es-AR')}%`}
          hint={pctIncompleto ? 'No suma 100%' : 'Repartida'}
          tone={pctIncompleto ? 'warning' : 'neutral'}
        />
      </div>

      {pctIncompleto && (
        <div className="flex items-start gap-3 rounded-2xl bg-warning/10 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              La participación suma {totales.pct.toLocaleString('es-AR')}%, no 100%
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Mientras no cierre en 100, la comparación entre lo que a cada uno le corresponde y lo
              que retiró no significa nada.
            </p>
          </div>
        </div>
      )}

      <Panel
        icon={Users}
        title="Cuenta corriente"
        description="Lo que cada socio puso y se llevó"
      >
        {positions.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">Todavía no cargaste socios</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Cargá a cada socio con su participación. Después vas a poder registrar aportes y
              retiros a nombre de cada uno, sin que se mezclen con los ingresos y egresos del
              negocio.
            </p>
            <Button className="mt-4 gap-1.5" onClick={() => openSheet('new-partner')}>
              <Plus className="size-4" />
              Agregar el primero
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {positions.map((p) => (
              <PartnerRow
                key={p.id}
                position={p}
                currency={currency}
                vinculado={!!p.user_id && !!people[p.user_id]}
                movimientos={movimientosPorSocio.get(p.id) ?? []}
                accounts={accounts}
                abierto={abierto === p.id}
                onToggle={() => setAbierto((prev) => (prev === p.id ? null : p.id))}
                onEdit={() => openSheet('edit-partner', { partner: p })}
              />
            ))}
          </ul>
        )}
      </Panel>
    </PageLayout>
  );
}

function PartnerRow({
  position: p,
  currency,
  vinculado,
  movimientos,
  accounts,
  abierto,
  onToggle,
  onEdit,
}: {
  position: PartnerPosition;
  currency: any;
  vinculado: boolean;
  movimientos: Transaction[];
  accounts: { id: string; name: string }[];
  abierto: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  // Se retiró de más si el porcentaje de lo retirado supera la participación.
  // Sólo tiene sentido comparar cuando hay participación cargada y algo
  // retirado; si no, no hay contra qué medir.
  const comparable = p.ownership_pct > 0 && p.retiros_pct !== null;
  const retiroDeMas = comparable && p.retiros_pct! - p.ownership_pct > 1;

  return (
    <li>
      <div className="flex items-center gap-3 py-3">
        {/* Toda la ficha abre el detalle: el objetivo de la fila es responder
            "¿de dónde salió esto?", y hacerlo pedir puntería en una flechita
            chica lo esconde. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={abierto}
          aria-label={`Ver los movimientos de ${p.name}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserAvatar person={{ id: p.id, full_name: p.name, email: '', avatar_url: null }} />

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[15px] font-medium leading-tight">{p.name}</span>
              {p.ownership_pct > 0 && (
                <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                  {p.ownership_pct.toLocaleString('es-AR')}%
                </span>
              )}
              {!vinculado && (
                <span className="shrink-0 text-[11px] text-muted-foreground">sin cuenta</span>
              )}
            </span>

            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="tabular-nums">Aportó {formatMoney(p.aportes, currency)}</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">Retiró {formatMoney(p.retiros, currency)}</span>
              {retiroDeMas && (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1 font-medium text-warning">
                    <AlertTriangle className="size-3" />
                    se llevó el {p.retiros_pct!.toLocaleString('es-AR')}% de lo retirado
                  </span>
                </>
              )}
            </span>
          </span>

          <span className="shrink-0 text-right">
            <span
              className={cn(
                'block text-[15px] font-semibold leading-tight tabular-nums',
                p.saldo >= 0 ? 'text-income' : 'text-expense'
              )}
            >
              {formatMoney(p.saldo, currency)}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {p.saldo >= 0 ? 'a favor' : 'en contra'}
            </span>
          </span>

          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              abierto && 'rotate-180'
            )}
          />
        </button>

        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${p.name}`}
          className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      {abierto && (
        <div className="pb-3">
          {movimientos.length === 0 ? (
            <p className="rounded-xl bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">
              {p.name} todavía no tiene aportes ni retiros cargados.
            </p>
          ) : (
            <>
              <ul className="overflow-hidden rounded-xl border border-border/60">
                {movimientos.map((m) => {
                  const esAporte = m.type === 'contribution';
                  const billetera = accounts.find((a) => a.id === m.account_id)?.name;
                  return (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 border-b border-border/60 bg-muted/30 px-3 py-2.5 last:border-b-0"
                    >
                      <span
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-lg',
                          esAporte ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'
                        )}
                      >
                        {esAporte ? (
                          <HandCoins className="size-3.5" />
                        ) : (
                          <Landmark className="size-3.5" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm leading-tight">
                          {m.description?.trim() || (esAporte ? 'Aporte' : 'Retiro')}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="tabular-nums">
                            {parseLocalDate(m.date).toLocaleDateString('es-AR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                          {billetera && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="truncate">{billetera}</span>
                            </>
                          )}
                        </p>
                      </div>

                      <p
                        className={cn(
                          'shrink-0 text-sm font-semibold tabular-nums',
                          esAporte ? 'text-income' : 'text-expense'
                        )}
                      >
                        {esAporte ? '+' : '−'} {formatMoney(m.amount, currency)}
                      </p>
                    </li>
                  );
                })}
              </ul>

              {/* La salida al detalle completo: filtrar, editar, buscar. */}
              <Link
                href={`/transactions?partner=${p.id}`}
                className="mt-2 inline-flex items-center gap-1.5 px-1 text-sm font-medium text-primary hover:underline"
              >
                Ver en movimientos
                <ArrowRight className="size-3.5" />
              </Link>
            </>
          )}
        </div>
      )}
    </li>
  );
}
