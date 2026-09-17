'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Repeat, Tags, Trash2, FolderOpen } from 'lucide-react';
import { useFinanceStore } from '@/stores/finance-store';
import { useUIStore } from '@/stores/ui-store';
import { getIcon } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money';
import { describirUso, describirUsoDeGrupo } from '@/lib/categorias';
import { SimpleAccordion } from '@/components/ui/simple-accordion';
import { useGlobalDialog } from '@/components/providers/dialog-provider';
import { PageLayout } from '@/components/layout/page-layout';
import { BorrarConReemplazo } from '@/components/borrar-con-reemplazo';
import type { Category, CategoryGroup } from '@/lib/types';

type Tipo = 'income' | 'expense';
type Totales = { usos: number; ARS: number; USD: number };
type CategoriaConUso = Category & { totales: Totales };
type Grupo = { id: string; nombre: string; esSistema: boolean; totales: Totales; categorias: CategoriaConUso[] };

const ARS = { id: 'ars', code: 'ARS', symbol: '$', name: 'Pesos' } as const;
const USD = { id: 'usd', code: 'USD', symbol: 'US$', name: 'Dólares' } as const;
const vacio = (): Totales => ({ usos: 0, ARS: 0, USD: 0 });

/**
 * Macrogrupos y categorías.
 *
 * Se agrupa por `group_id`, el grupo real, y no por el nombre que repite cada
 * categoría: ese texto llegó a estar desincronizado y mostraba categorías en el
 * grupo equivocado (DB/047 ahora lo mantiene la base).
 *
 * Borrar pasa siempre por `BorrarConReemplazo`: pregunta a la base si está en
 * uso, y si lo está pide con qué reemplazarlo antes de dejar confirmar.
 */
export function CategoriesView() {
  const categories = useFinanceStore((s) => s.categories);
  const categoryGroups = useFinanceStore((s) => s.categoryGroups);
  const transactions = useFinanceStore((s) => s.transactions);
  const currencies = useFinanceStore((s) => s.currencies);
  const renameCategoryGroup = useFinanceStore((s) => s.renameCategoryGroup);
  const removeCategory = useFinanceStore((s) => s.removeCategory);
  const removeCategoryGroup = useFinanceStore((s) => s.removeCategoryGroup);
  const categoryUsage = useFinanceStore((s) => s.categoryUsage);
  const groupUsage = useFinanceStore((s) => s.groupUsage);
  const addCategory = useFinanceStore((s) => s.addCategory);
  const openSheet = useUIStore((s) => s.openSheet);
  const router = useRouter();
  const dialog = useGlobalDialog();

  const [abierto, setAbierto] = useState<string | null>(null);
  const [borrandoCategoria, setBorrandoCategoria] = useState<Category | null>(null);
  const [borrandoGrupo, setBorrandoGrupo] = useState<CategoryGroup | null>(null);

  const nombreDeGrupo = useMemo(() => new Map(categoryGroups.map((g) => [g.id, g.name])), [categoryGroups]);

  const { egresos, ingresos, vacios } = useMemo(() => {
    const porCategoria = new Map<string, Totales>();
    const esUsd = new Set(currencies.filter((c) => c.code === 'USD').map((c) => c.id));
    for (const t of transactions) {
      if (!t.category_id) continue;
      const tot = porCategoria.get(t.category_id) ?? vacio();
      tot.usos += 1;
      if (esUsd.has(t.currency_id)) tot.USD += Math.abs(t.amount);
      else tot.ARS += Math.abs(t.amount);
      porCategoria.set(t.category_id, tot);
    }

    const armar = (tipo: Tipo): Grupo[] => {
      const grupos = new Map<string, Grupo>();
      for (const cat of categories.filter((c) => c.type === tipo)) {
        const id = cat.group_id ?? `sin-grupo:${cat.group_name ?? 'General'}`;
        if (!grupos.has(id)) {
          const g = categoryGroups.find((x) => x.id === cat.group_id);
          grupos.set(id, {
            id,
            nombre: g?.name ?? cat.group_name ?? 'General',
            esSistema: !g || g.is_system || !g.workspace_id,
            totales: vacio(),
            categorias: [],
          });
        }
        const grupo = grupos.get(id)!;
        const totales = porCategoria.get(cat.id) ?? vacio();
        grupo.totales.usos += totales.usos;
        grupo.totales.ARS += totales.ARS;
        grupo.totales.USD += totales.USD;
        grupo.categorias.push({ ...cat, totales });
      }
      const lista = [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
      lista.forEach((g) => g.categorias.sort((a, b) => a.name.localeCompare(b.name)));
      return lista;
    };

    // Un grupo sin categorías no tiene tipo, así que no entra en Egresos ni en
    // Ingresos. Antes no aparecía en ningún lado: había cuatro en Samurai que no
    // se podían ver ni borrar.
    const conCategorias = new Set(categories.map((c) => c.group_id));
    const sinNada = categoryGroups
      .filter((g) => g.workspace_id && !g.is_system && !conCategorias.has(g.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { egresos: armar('expense'), ingresos: armar('income'), vacios: sinNada };
  }, [categories, categoryGroups, transactions, currencies]);

  // ---------------------------------------------------------------- acciones

  const renombrar = async (grupo: Grupo) => {
    const nuevo = (await dialog.prompt('Renombrar macrogrupo', 'Nuevo nombre:', grupo.nombre))?.trim();
    if (nuevo && nuevo !== grupo.nombre) await renameCategoryGroup(grupo.id, nuevo);
  };

  const nuevoGrupo = async () => {
    const nombre = (await dialog.prompt('Nuevo macrogrupo', 'Nombre del grupo:'))?.trim();
    if (nombre) await addCategory({ name: 'General', type: 'expense', group_name: nombre });
  };

  /** Con qué se puede reemplazar una categoría: las otras del MISMO tipo. */
  const opcionesParaCategoria = (cat: Category) =>
    categories
      .filter((c) => c.id !== cat.id && c.type === cat.type)
      .map((c) => ({
        value: c.id,
        label: c.name,
        hint: (c.group_id && nombreDeGrupo.get(c.group_id)) || c.group_name,
      }))
      .sort((a, b) => `${a.hint} ${a.label}`.localeCompare(`${b.hint} ${b.label}`));

  const opcionesParaGrupo = (grupo: CategoryGroup) =>
    categoryGroups
      .filter((g) => g.id !== grupo.id)
      .map((g) => ({ value: g.id, label: g.name }))
      .sort((a, b) => a.label.localeCompare(b.label));

  // ---------------------------------------------------------------- dibujo

  const botonIcono = (etiqueta: string, onClick: () => void, icono: React.ReactNode, peligro = false) => (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors',
        peligro ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-accent/60 hover:text-foreground'
      )}
    >
      {icono}
    </button>
  );

  // En el teléfono no hay "pasar el mouse": las acciones se ven siempre. En
  // pantalla grande aparecen al pasar por la fila, para no llenar la lista.
  const acciones = 'flex items-center md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100';

  const montos = (t: Totales, tipo: Tipo, grande = false) => (
    <div className={cn('flex flex-col items-end tabular-nums', grande ? 'text-sm font-semibold' : 'text-xs')}>
      {(t.ARS > 0 || t.USD === 0) && (
        <span className={cn(!grande && 'font-semibold', tipo === 'income' ? 'text-income' : 'text-expense')}>
          {formatMoney(t.ARS, ARS as any)}
        </span>
      )}
      {t.USD > 0 && <span className="text-muted-foreground">{formatMoney(t.USD, USD as any)}</span>}
    </div>
  );

  const dibujarGrupo = (grupo: Grupo, tipo: Tipo) => {
    const clave = `${tipo}-${grupo.id}`;
    const real = categoryGroups.find((g) => g.id === grupo.id);
    return (
      <SimpleAccordion
        key={clave}
        isOpen={abierto === clave}
        onToggle={() => setAbierto((prev) => (prev === clave ? null : clave))}
        title={<span className="truncate text-sm font-semibold tracking-tight">{grupo.nombre}</span>}
        actions={
          !grupo.esSistema && real ? (
            <span className={acciones}>
              {botonIcono('Renombrar macrogrupo', () => void renombrar(grupo), <Pencil className="size-3.5" />)}
              {botonIcono('Eliminar macrogrupo', () => setBorrandoGrupo(real), <Trash2 className="size-3.5" />, true)}
            </span>
          ) : undefined
        }
        summary={
          <div className="mr-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="rounded-lg bg-accent px-2 py-1 tabular-nums text-accent-foreground">
              {grupo.totales.usos} {grupo.totales.usos === 1 ? 'uso' : 'usos'}
            </span>
            {montos(grupo.totales, tipo)}
          </div>
        }
      >
        <div className="flex flex-col space-y-1">
          {grupo.categorias.map((cat) => {
            const Icono = getIcon(cat.icon || 'folder');
            return (
              <div
                key={cat.id}
                onClick={() => router.push(`/transactions?category=${cat.id}`)}
                className="group flex cursor-pointer items-center justify-between gap-3 rounded-xl p-3 transition-colors hover:bg-accent/60"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    {cat.is_recurring ? <Repeat className="size-5" /> : <Icono className="size-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{cat.name}</p>
                      {cat.is_recurring && (
                        <Badge
                          variant="secondary"
                          className="h-5 shrink-0 border-none bg-primary/10 px-1.5 text-[10px] uppercase tracking-widest text-primary"
                        >
                          Recurrente
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {cat.totales.usos} {cat.totales.usos === 1 ? 'uso' : 'usos'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {montos(cat.totales, tipo, true)}
                  <span className={acciones}>
                    {botonIcono('Editar categoría', () => openSheet('edit-category', { category: cat }), <Pencil className="size-4" />)}
                    {botonIcono('Eliminar categoría', () => setBorrandoCategoria(cat), <Trash2 className="size-4" />, true)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </SimpleAccordion>
    );
  };

  const seccion = (titulo: string, tipo: Tipo, grupos: Grupo[]) => (
    <div className="pb-2">
      <div className="mb-4 flex items-center gap-2 pl-1">
        <Badge
          variant="secondary"
          className={cn(
            'border-none px-3 py-1 text-sm',
            tipo === 'expense' ? 'bg-expense/15 text-expense' : 'bg-income/15 text-income'
          )}
        >
          {titulo}
        </Badge>
        <span className="text-xs text-muted-foreground">Macrogrupos y categorías</span>
      </div>
      <div className="space-y-3">{grupos.map((g) => dibujarGrupo(g, tipo))}</div>
    </div>
  );

  return (
    <PageLayout
      title="Categorías"
      icon={Tags}
      actions={
        <>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => void nuevoGrupo()}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Nuevo grupo</span>
          </Button>
          <Button size="sm" className="gap-2" onClick={() => openSheet('new-category')}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Nueva categoría</span>
          </Button>
        </>
      }
    >
      {seccion('Egresos', 'expense', egresos)}
      {seccion('Ingresos', 'income', ingresos)}

      {vacios.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2 pl-1">
            <Badge variant="secondary" className="border-none px-3 py-1 text-sm">
              Sin categorías
            </Badge>
            <span className="text-xs text-muted-foreground">Macrogrupos vacíos</span>
          </div>
          <div className="space-y-1 rounded-2xl border border-border/60 bg-card p-2">
            {vacios.map((g) => (
              <div key={g.id} className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{g.name}</span>
                </span>
                <span className={acciones}>
                  {botonIcono(
                    'Renombrar macrogrupo',
                    () => void renombrar({ id: g.id, nombre: g.name, esSistema: false, totales: vacio(), categorias: [] }),
                    <Pencil className="size-3.5" />
                  )}
                  {botonIcono('Eliminar macrogrupo', () => setBorrandoGrupo(g), <Trash2 className="size-3.5" />, true)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {borrandoCategoria && (
        <BorrarConReemplazo
          abierto
          onCerrar={() => setBorrandoCategoria(null)}
          titulo="Eliminar categoría"
          nombre={borrandoCategoria.name}
          cargarUso={async () => {
            const uso = await categoryUsage(borrandoCategoria.id);
            return { total: uso.total, descripcion: describirUso(uso) };
          }}
          opciones={opcionesParaCategoria(borrandoCategoria)}
          etiquetaReemplazo="Reemplazar por"
          explicacionReemplazo="Todo lo que la usaba pasa a la que elijas."
          sinOpciones={`No hay otra categoría de ${borrandoCategoria.type === 'income' ? 'ingresos' : 'egresos'} para reemplazarla. Creá una primero.`}
          onConfirmar={(reemplazo) => void removeCategory(borrandoCategoria.id, reemplazo)}
        />
      )}

      {borrandoGrupo && (
        <BorrarConReemplazo
          abierto
          onCerrar={() => setBorrandoGrupo(null)}
          titulo="Eliminar macrogrupo"
          nombre={borrandoGrupo.name}
          cargarUso={async () => {
            const uso = await groupUsage(borrandoGrupo.id);
            return { total: uso.total, descripcion: describirUsoDeGrupo(uso) };
          }}
          opciones={opcionesParaGrupo(borrandoGrupo)}
          etiquetaReemplazo="Pasar a"
          explicacionReemplazo="Sus categorías pasan a ese grupo; si ahí ya hay una con el mismo nombre, se fusionan."
          sinOpciones="No hay otro macrogrupo al que pasar sus categorías. Creá uno primero."
          onConfirmar={(reemplazo) => void removeCategoryGroup(borrandoGrupo.id, reemplazo)}
        />
      )}
    </PageLayout>
  );
}
