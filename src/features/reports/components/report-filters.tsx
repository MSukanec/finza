'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { GRAINS, type ReportFilters as Filters } from '../use-report-data';
import { CalendarRange, RotateCcw, SlidersHorizontal } from 'lucide-react';

export type Preset = '3m' | '6m' | '12m' | 'ytd' | 'all' | 'custom';

const PRESETS: { id: Preset; label: string }[] = [
  { id: '3m', label: '3 meses' },
  { id: '6m', label: '6 meses' },
  { id: '12m', label: '12 meses' },
  { id: 'ytd', label: 'Este año' },
  { id: 'all', label: 'Todo' },
  { id: 'custom', label: 'Personalizado' },
];

/** Los presets se traducen a fechas acá para que el resto no sepa de presets. */
export function presetRange(preset: Preset): { from: Date | null; to: Date | null } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const monthsAgo = (n: number) => new Date(now.getFullYear(), now.getMonth() - n + 1, 1);

  switch (preset) {
    case '3m':
      return { from: monthsAgo(3), to: endOfToday };
    case '6m':
      return { from: monthsAgo(6), to: endOfToday };
    case '12m':
      return { from: monthsAgo(12), to: endOfToday };
    case 'ytd':
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfToday };
    default:
      return { from: null, to: null };
  }
}

const toInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

const TRIGGER =
  'flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-accent';

/**
 * Toda la barra de filtros entra en la fila única del header, alineada a la
 * derecha. Agrupar y Métrica se muestran sueltos sólo cuando hay ancho; abajo
 * de eso caen dentro del popover, así el header nunca desborda ni gana altura.
 */
export function ReportFilters({
  filters,
  preset,
  onChange,
  onPresetChange,
  resultCount,
}: {
  filters: Filters;
  preset: Preset;
  onChange: (patch: Partial<Filters>) => void;
  onPresetChange: (preset: Preset) => void;
  resultCount: number;
}) {
  const accounts = useFinanceStore((s) => s.accounts);
  const groups = useFinanceStore((s) => s.categoryGroups);

  const extraCount = (filters.walletId !== 'all' ? 1 : 0) + (filters.groupId !== 'all' ? 1 : 0);
  const isFiltered = extraCount > 0 || preset !== '12m';
  const presetLabel = PRESETS.find((p) => p.id === preset)?.label ?? '';

  const clearAll = () => {
    onPresetChange('12m');
    onChange({ walletId: 'all', groupId: 'all' });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm tabular-nums text-muted-foreground xl:inline">
        {resultCount.toLocaleString('es-AR')} mov.
      </span>

      {/* Rango */}
      <Popover>
        <PopoverTrigger className={TRIGGER} aria-label="Rango de fechas">
          <CalendarRange className="size-4 text-muted-foreground" />
          <span className="hidden sm:inline">{presetLabel}</span>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          <p className="text-xs font-medium text-muted-foreground">Rango</p>
          <div className="grid grid-cols-2 gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => onPresetChange(p.id)}
                aria-pressed={preset === p.id}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
                  preset === p.id
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2.5">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Desde</Label>
                <Input
                  className="h-9"
                  type="date"
                  value={toInput(filters.from)}
                  onChange={(e) =>
                    onChange({ from: e.target.value ? new Date(`${e.target.value}T00:00:00`) : null })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Hasta</Label>
                <Input
                  className="h-9"
                  type="date"
                  value={toInput(filters.to)}
                  onChange={(e) =>
                    onChange({ to: e.target.value ? new Date(`${e.target.value}T23:59:59`) : null })
                  }
                />
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Agrupar y Métrica: sueltos sólo si hay ancho */}
      <div className="hidden lg:block">
        <Select value={filters.grain} onValueChange={(v) => v && onChange({ grain: v as Filters['grain'] })}>
          <SelectTrigger className="h-9 w-[124px]">
            <SelectValue>{GRAINS.find((g) => g.id === filters.grain)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GRAINS.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resto */}
      <Popover>
        <PopoverTrigger className={cn(TRIGGER, 'relative')} aria-label="Más filtros">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          <span className="hidden sm:inline">Filtros</span>
          {extraCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex size-4.5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {extraCount}
            </span>
          )}
        </PopoverTrigger>

        <PopoverContent align="end" className="w-64">
          {/* En pantallas chicas estos dos no están sueltos, así que van acá. */}
          <div className="space-y-1 lg:hidden">
            <Label className="text-xs text-muted-foreground">Agrupar por</Label>
            <Select value={filters.grain} onValueChange={(v) => v && onChange({ grain: v as Filters['grain'] })}>
              <SelectTrigger className="h-9">
                <SelectValue>{GRAINS.find((g) => g.id === filters.grain)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GRAINS.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Billetera</Label>
            <Select value={filters.walletId} onValueChange={(v) => v && onChange({ walletId: v })}>
              <SelectTrigger className="h-9">
                <SelectValue>
                  {filters.walletId === 'all'
                    ? 'Todas'
                    : accounts.find((a) => a.id === filters.walletId)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {[...accounts].sort((a, b) => a.name.localeCompare(b.name)).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Grupo</Label>
            <Select value={filters.groupId} onValueChange={(v) => v && onChange({ groupId: v })}>
              <SelectTrigger className="h-9">
                <SelectValue>
                  {filters.groupId === 'all'
                    ? 'Todos'
                    : groups.find((g: any) => g.id === filters.groupId)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {[...groups]
                  .sort((a: any, b: any) => a.name.localeCompare(b.name))
                  .map((g: any) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
            <span className="tabular-nums">{resultCount.toLocaleString('es-AR')} movimientos</span>
            {isFiltered && (
              <button onClick={clearAll} className="flex items-center gap-1.5 hover:text-foreground">
                <RotateCcw className="size-3.5" />
                Limpiar
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
