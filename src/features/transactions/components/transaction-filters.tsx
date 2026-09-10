'use client';

import type { TransactionType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Search, Calendar, Wallet, SlidersHorizontal, Tags, Layers, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Picker } from '@/components/ui/picker';
import { useFinanceStore } from '@/stores/finance-store';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';

interface TransactionFiltersProps {
  filterType: TransactionType | 'all';
  onFilterChange: (type: TransactionType | 'all') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterWalletId: string;
  onWalletChange: (w: string) => void;
  filterCategoryId: string;
  onCategoryChange: (c: string) => void;
  filterGroupId: string;
  onGroupChange: (g: string) => void;
  dateFrom: string;
  onDateFromChange: (d: string) => void;
  dateTo: string;
  onDateToChange: (d: string) => void;
}

const TABS: { value: TransactionType | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'transfer', label: 'Transferencias' },
];

export function TransactionFilters({
  filterType,
  onFilterChange,
  searchQuery,
  onSearchChange,
  filterWalletId,
  onWalletChange,
  filterCategoryId,
  onCategoryChange,
  filterGroupId,
  onGroupChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
}: TransactionFiltersProps) {
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const groups = useFinanceStore((s) => s.categoryGroups);

  // El tipo no cuenta acá: vive en los chips, a la vista.
  const advancedCount =
    (filterWalletId !== 'all' ? 1 : 0) +
    (filterCategoryId !== 'all' ? 1 : 0) +
    (filterGroupId !== 'all' ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const clearAll = () => {
    onWalletChange('all');
    onCategoryChange('all');
    onGroupChange('all');
    onDateFromChange('');
    onDateToChange('');
  };

  const visibleCategories =
    filterGroupId !== 'all' ? categories.filter((c) => c.group_id === filterGroupId) : categories;

  return (
    /* Una sola fila: vive en el header de la página, no en el body. */
    <div className="flex min-w-0 items-center gap-2">
      {/* Antes aparecían en `lg`, pero entre 1024 y ~1250px no entraban junto
          al buscador y al botón "Nuevo": el header se pasaba de ancho. Debajo
          de `xl` el tipo se elige desde el popover de filtros. */}
      <div className="hidden h-9 shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5 xl:inline-flex">
        {TABS.map((tab) => {
          const active = filterType === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onFilterChange(tab.value)}
              aria-pressed={active}
              className={cn(
                'flex h-8 shrink-0 items-center rounded-md px-2.5 text-sm transition-colors',
                active
                  ? 'bg-card font-medium text-foreground shadow-soft-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {/* El buscador es lo único elástico de la fila: se encoge hasta 7rem
            para que los botones nunca se recorten ni empujen el ancho. */}
        <div className="relative w-36 min-w-[7rem] shrink sm:w-52">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar movimiento…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 pl-8 text-sm"
            aria-label="Buscar movimiento"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-accent"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Popover>
          <PopoverTrigger
            aria-label="Filtros avanzados"
            className={cn(
              'relative flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-accent'
            )}
          >
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            <span className="hidden sm:inline">Filtros</span>
            {advancedCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {advancedCount}
              </span>
            )}
          </PopoverTrigger>

          <PopoverContent
            align="end"
            className="w-[min(340px,calc(100vw-2rem))] space-y-4 p-4 shadow-soft-md"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h4 className="text-sm font-semibold">Filtros avanzados</h4>
              {advancedCount > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Limpiar
                </button>
              )}
            </div>

            <div className="space-y-1.5 xl:hidden">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <SlidersHorizontal className="size-3.5" />
                Tipo
              </Label>
              <Picker
                value={filterType}
                onValueChange={(v) => onFilterChange(v as TransactionType | 'all')}
                options={TABS.map((t) => ({ value: t.value, label: t.label }))}
              />
            </div>

            <Field icon={Wallet} label="Billetera">
              <Picker
                value={filterWalletId}
                onValueChange={onWalletChange}
                options={[
                  { value: 'all', label: 'Cualquiera' },
                  ...accounts.map((a) => ({ value: a.id, label: a.name })),
                ]}
              />
            </Field>

            <Field icon={Layers} label="Grupo">
              <Picker
                value={filterGroupId}
                onValueChange={(v) => {
                  onGroupChange(v);
                  onCategoryChange('all');
                }}
                options={[
                  { value: 'all', label: 'Todos' },
                  ...groups.map((g) => ({ value: g.id, label: g.name })),
                ]}
              />
            </Field>

            <Field icon={Tags} label="Categoría">
              <Picker
                value={filterCategoryId}
                onValueChange={onCategoryChange}
                options={[
                  { value: 'all', label: 'Todas' },
                  ...visibleCategories.map((c) => ({
                    value: c.id,
                    label: c.name,
                    hint: c.group_name,
                  })),
                ]}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field icon={Calendar} label="Desde">
                <Input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} />
              </Field>
              <Field icon={Calendar} label="Hasta">
                <Input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} />
              </Field>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </Label>
      {children}
    </div>
  );
}
