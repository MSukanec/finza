'use client';

import { useEffect, useMemo, useState } from 'react';
import { History, Plus, Pencil, Trash2, RotateCcw, Undo2, Archive } from 'lucide-react';
import { PageLayout } from '@/components/layout/page-layout';
import { Panel } from '@/components/ui/panel';
import { Picker } from '@/components/ui/picker';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useFinanceStore } from '@/stores/finance-store';
import { cn } from '@/lib/utils';
import type { ActivityEntry, Person, Purge } from '@/lib/types';

const ACTION_META = {
  insert: { icon: Plus, label: 'Creó', chip: 'bg-income/10 text-income' },
  update: { icon: Pencil, label: 'Editó', chip: 'bg-transfer/10 text-transfer' },
  delete: { icon: Trash2, label: 'Eliminó', chip: 'bg-expense/10 text-expense' },
} as const;

const ENTITIES: { id: string; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'transactions', label: 'Movimientos' },
  { id: 'wallets', label: 'Billeteras' },
  { id: 'wallet_reconciliations', label: 'Arqueos' },
  { id: 'categories', label: 'Categorías' },
  { id: 'category_groups', label: 'Grupos' },
  { id: 'budgets', label: 'Presupuestos' },
  { id: 'debts', label: 'Deudas' },
  { id: 'workspace_members', label: 'Miembros' },
  { id: 'workspaces', label: 'Espacios' },
];

/** Campos cuyo cambio no le dice nada a nadie. */
const HIDDEN_FIELDS = new Set(['id', 'user_id', 'workspace_id', 'import_batch', 'deleted_at']);

const FIELD_LABEL: Record<string, string> = {
  amount: 'Monto',
  initial_balance: 'Saldo inicial',
  name: 'Nombre',
  description: 'Descripción',
  date: 'Fecha',
  status: 'Estado',
  type: 'Tipo',
  category_id: 'Categoría',
  wallet_id: 'Billetera',
  currency_code: 'Moneda',
  role: 'Rol',
  is_recurring: 'Recurrente',
  limit_amount: 'Tope',
  period: 'Período',
  invoiced_at: 'Fecha de devengado',
  is_checkpoint: 'Hito de control',
  counted_amount: 'Contado',
  expected_amount: 'Calculado por la app',
  resolution: 'Resolución',
  note: 'Nota',
};

export function ActivityView() {
  const currentWorkspaceId = useFinanceStore((s) => s.currentWorkspaceId);
  const people = useFinanceStore((s) => s.people);
  const loadActivity = useFinanceStore((s) => s.loadActivity);

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entity, setEntity] = useState('all');
  const [author, setAuthor] = useState('all');

  const refresh = () => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    setError(null);
    loadActivity(currentWorkspaceId)
      .then(setEntries)
      .catch((e: any) => setError(e?.message || 'No se pudo cargar el historial.'))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [currentWorkspaceId, loadActivity]);

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (entity === 'all' || e.entity === entity) &&
          (author === 'all' || e.user_id === author)
      ),
    [entries, entity, author]
  );

  // Agrupado por día, como los movimientos.
  const grouped = useMemo(() => {
    const out = new Map<string, ActivityEntry[]>();
    for (const e of filtered) {
      const key = dayLabel(new Date(e.created_at));
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(e);
    }
    return [...out.entries()];
  }, [filtered]);

  const authors = Object.values(people);

  return (
    <PageLayout
      title="Actividad"
      description="Lo que hizo cada miembro de este espacio"
      icon={History}
      actions={
        <>
          <Picker
            value={entity}
            onValueChange={setEntity}
            options={ENTITIES.map((e) => ({ value: e.id, label: e.label }))}
            className="w-[140px]"
          />

          {authors.length > 1 && (
            <Picker
              value={author}
              onValueChange={setAuthor}
              options={[
                { value: 'all', label: 'Todos' },
                ...authors.map((p) => ({ value: p.id, label: p.full_name || p.email || 'Sin nombre' })),
              ]}
              className="w-[150px]"
            />
          )}

          <button
            onClick={refresh}
            aria-label="Actualizar"
            className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-accent"
          >
            <RotateCcw className={cn('size-4 text-muted-foreground', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </>
      }
    >
        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <PanelDeVaciados />

        {!error && !loading && filtered.length === 0 && (
          <Panel icon={History} title="Sin actividad">
            <p className="py-6 text-center text-sm text-muted-foreground">
              {entries.length === 0
                ? 'Todavía nadie hizo nada en este espacio. Acá aparece lo que hacen los miembros: cargar, editar y eliminar.'
                : 'Ningún registro coincide con el filtro.'}
            </p>
          </Panel>
        )}

        {loading && entries.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        )}

        {grouped.map(([day, items]) => (
          <section key={day}>
            <h3 className="mb-2 px-1 text-xs font-medium text-muted-foreground">{day}</h3>
            <div className="space-y-2">
              {items.map((e) => (
                <Entry key={e.id} entry={e} person={e.user_id ? people[e.user_id] : undefined} />
              ))}
            </div>
          </section>
        ))}
    </PageLayout>
  );
}

function Entry({ entry, person }: { entry: ActivityEntry; person?: Person }) {
  const meta = ACTION_META[entry.action];
  const Icon = meta.icon;

  // Acá sólo llegan acciones de personas: las que no tienen autor —migraciones
  // y disparadores de la base— quedan filtradas en la consulta. Si aun así no
  // se puede resolver el nombre, se dice, en vez de disfrazarlo de "Sistema".
  const autor =
    person?.full_name || person?.email || 'Alguien que ya no podemos identificar';

  const changes = Object.entries(entry.changes ?? {}).filter(([k]) => !HIDDEN_FIELDS.has(k));

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-card p-3 shadow-soft-xs">
      <span className="relative shrink-0">
        <UserAvatar person={person} />
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full ring-2 ring-card',
            meta.chip
          )}
        >
          <Icon className="size-2.5" />
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">
          <span className="font-medium">{autor}</span>{' '}
          {person && person.es_miembro === false && (
            <span className="text-xs text-muted-foreground">(ya no está en el espacio)</span>
          )}{' '}
          <span className="text-muted-foreground">{lowerFirst(entry.summary)}</span>
        </p>

        {changes.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {changes.map(([field, diff]) => (
              <li key={field} className="text-xs text-muted-foreground">
                <span className="text-foreground">{FIELD_LABEL[field] ?? field}</span>:{' '}
                <span className="line-through">{renderValue(diff.antes)}</span>
                {' → '}
                <span className="text-foreground">{renderValue(diff.despues)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <time
        dateTime={entry.created_at}
        className="shrink-0 text-xs tabular-nums text-muted-foreground"
        title={new Date(entry.created_at).toLocaleString('es-AR')}
      >
        {new Date(entry.created_at).toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </time>
    </div>
  );
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'vacío';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (typeof v === 'number') return v.toLocaleString('es-AR');
  const s = String(v);
  // Los ids no le dicen nada a nadie; se acortan para que no tapen la línea.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) return s.slice(0, 8) + '…';
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s).toLocaleDateString('es-AR');
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function dayLabel(d: Date): string {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((startOfToday.getTime() - day.getTime()) / 86400000);

  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Los vaciados de caja y su botón de deshacer.
 *
 * Vive acá y no en una pantalla de ajustes por una razón concreta: vaciar la
 * caja no aparece en el historial —serían mil quinientas entradas y lo volvería
 * inservible—, así que sin este panel sería lo único que pasa en el espacio sin
 * dejar rastro visible. Y el día que alguien quiera deshacerlo, lo va a buscar
 * justamente donde está lo que pasó.
 */
function PanelDeVaciados() {
  const purges = useFinanceStore((s) => s.purges);
  const people = useFinanceStore((s) => s.people);
  const restaurarPurga = useFinanceStore((s) => s.restaurarPurga);

  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  if (purges.length === 0) return null;

  const restaurar = async (p: Purge) => {
    setConfirmando(null);
    setTrabajando(p.id);
    setFallo(null);
    try {
      await restaurarPurga(p.id);
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setTrabajando(null);
    }
  };

  return (
    <Panel
      icon={Archive}
      title="Vaciados de caja"
      description="Cada uno borró todos los movimientos del espacio de una vez. Se pueden deshacer enteros."
      padded={false}
    >
      {fallo && (
        <p role="alert" className="mx-4 mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive md:mx-5">
          {fallo}
        </p>
      )}

      <ul className="divide-y divide-border/60">
        {purges.map((p) => {
          const quien = people[p.user_id];
          const cuando = new Date(p.created_at).toLocaleString('es-AR', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          });

          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  <span className="tabular-nums">{p.transactions_count}</span> movimientos
                  {p.reason ? ` · ${p.reason}` : ''}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {cuando}
                  {quien ? ` · ${quien.full_name || quien.email}` : ''}
                </p>
              </div>

              {p.restored_at ? (
                <span className="rounded-lg bg-income/12 px-2.5 py-1 text-xs text-income">
                  Restaurado
                </span>
              ) : confirmando === p.id ? (
                <span className="flex gap-2">
                  <button
                    onClick={() => restaurar(p)}
                    className="flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Sí, devolver todo
                  </button>
                  <button
                    onClick={() => setConfirmando(null)}
                    className="flex h-9 items-center rounded-lg border border-border px-3 text-sm transition-colors hover:bg-accent"
                  >
                    Cancelar
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmando(p.id)}
                  disabled={trabajando === p.id}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
                >
                  <Undo2 className={cn('size-4 text-muted-foreground', trabajando === p.id && 'animate-spin')} />
                  {trabajando === p.id ? 'Devolviendo…' : 'Deshacer'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
