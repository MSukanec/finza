'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFinanceStore } from '@/stores/finance-store';
import { useUIStore } from '@/stores/ui-store';
import { PageLayout } from '@/components/layout/page-layout';
import { Panel, Kpi } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { PartnerPosition } from '@/lib/types';
import { Users, Plus, AlertTriangle, HandCoins, Landmark, Scale, Pencil } from 'lucide-react';

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
  const openSheet = useUIStore((s) => s.openSheet);

  const [positions, setPositions] = useState<PartnerPosition[]>([]);
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
  onEdit,
}: {
  position: PartnerPosition;
  currency: any;
  vinculado: boolean;
  onEdit: () => void;
}) {
  // Se retiró de más si el porcentaje de lo retirado supera la participación.
  // Sólo tiene sentido comparar cuando hay participación cargada y algo
  // retirado; si no, no hay contra qué medir.
  const comparable = p.ownership_pct > 0 && p.retiros_pct !== null;
  const desvio = comparable ? p.retiros_pct! - p.ownership_pct : 0;
  const retiroDeMas = comparable && desvio > 1;

  return (
    <li className="flex items-center gap-3 py-3">
      <UserAvatar person={{ id: p.id, full_name: p.name, email: '', avatar_url: null }} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-medium leading-tight">{p.name}</p>
          {p.ownership_pct > 0 && (
            <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
              {p.ownership_pct.toLocaleString('es-AR')}%
            </span>
          )}
          {!vinculado && (
            <span className="shrink-0 text-[11px] text-muted-foreground">sin cuenta</span>
          )}
        </div>

        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
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
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            'text-[15px] font-semibold leading-tight tabular-nums',
            p.saldo >= 0 ? 'text-income' : 'text-expense'
          )}
        >
          {formatMoney(p.saldo, currency)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {p.saldo >= 0 ? 'a favor' : 'en contra'}
        </p>
      </div>

      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar ${p.name}`}
        className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Pencil className="size-4" />
      </button>
    </li>
  );
}
