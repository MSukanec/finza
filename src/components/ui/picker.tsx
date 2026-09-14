'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { ChevronDownIcon, CheckIcon, SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAnclaDelCampo } from '@/components/ui/field';

export interface PickerOption {
  value: string;
  label: string;
  /** Texto secundario a la derecha: la moneda de una billetera, el grupo de una categoría. */
  hint?: string;
}

/**
 * El desplegable de toda la app.
 *
 * Reemplaza al Select para cualquier lista de opciones. Dos motivos:
 *
 * 1. El Select de Base UI abre alineando el ITEM SELECCIONADO sobre el trigger
 *    —comportamiento de select nativo de macOS—, asi que el popup saltaba a
 *    cualquier altura y tapaba los campos de arriba. Este abre siempre debajo
 *    del trigger, como un desplegable de toda la vida.
 * 2. Con 18 macrogrupos o 100 categorias, elegir sin buscador es scrollear a
 *    ciegas. El buscador aparece solo cuando la lista lo justifica.
 */
const UMBRAL_BUSCADOR = 7;

function Picker({
  value,
  onValueChange,
  options,
  placeholder = 'Elegir',
  searchable,
  disabled,
  id,
  className,
  emptyMessage = 'No hay resultados',
}: {
  value: string | null | undefined;
  onValueChange: (value: string) => void;
  options: PickerOption[];
  placeholder?: string;
  /** Por defecto aparece solo si la lista es larga. */
  searchable?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  emptyMessage?: string;
}) {
  const conBuscador = searchable ?? options.length > UMBRAL_BUSCADOR;
  // Adentro de un campo, la lista se mide contra la FILA entera y no contra
  // el disparador, que es sólo el tramo a la derecha de la etiqueta. Suelto,
  // se ancla a sí mismo como cualquier desplegable.
  const ancla = useAnclaDelCampo();
  const seleccionada = options.find((o) => o.value === value) ?? null;

  return (
    <Combobox.Root
      items={options}
      value={seleccionada}
      onValueChange={(v: PickerOption | null) => {
        if (v) onValueChange(v.value);
      }}
      // Las opciones son objetos {value, label}: Base UI toma `label` para
      // mostrar y `value` para el formulario sin que haya que explicárselo.
      disabled={disabled}
    >
      <Combobox.Trigger
        id={id}
        data-slot="picker-trigger"
        className={cn(
          'flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-xl border border-input bg-card/60 px-3.5 text-sm transition-[color,box-shadow,border-color] outline-none select-none',
          'hover:border-ring/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        {/* Combobox.Value no dibuja elemento propio, asi que la etiqueta se
            arma aca: ademas evita que el trigger muestre el valor crudo. */}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-left',
            !seleccionada && 'text-muted-foreground'
          )}
        >
          {seleccionada ? seleccionada.label : placeholder}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner
          anchor={ancla ?? undefined}
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="isolate z-[70]"
        >
          <Combobox.Popup
            data-slot="picker-popup"
            className={cn(
              // EXACTAMENTE el ancho del campo. Antes era `max(anchor, 12rem)`,
              // así que un campo angosto abría una lista más ancha que él y un
              // campo ancho abría una más finita: en las dos direcciones la
              // lista no coincidía con lo que la abrió y se leía como un error.
              // Las opciones largas se truncan, que es lo que hace el campo.
              'flex max-h-[min(20rem,var(--available-height))] w-(--anchor-width) flex-col overflow-hidden rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-soft-md',
              'origin-(--transform-origin) duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95'
            )}
          >
            {conBuscador && (
              <div className="relative shrink-0 border-b border-border/60">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Combobox.Input
                  placeholder="Buscar…"
                  className="h-11 w-full bg-transparent pl-9 pr-3 text-base outline-none placeholder:text-muted-foreground md:h-10 md:text-sm"
                />
              </div>
            )}

            {/* `empty:hidden` no es decorativo: Combobox.Empty SIEMPRE dibuja
                su <div> y sólo anula los hijos, así que sin esto el padding
                quedaba como una banda blanca fija arriba de la lista. */}
            <Combobox.Empty className="empty:hidden px-3 py-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </Combobox.Empty>

            <Combobox.List className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1">
              {(option: PickerOption) => (
                <Combobox.Item
                  key={option.value}
                  value={option}
                  className={cn(
                    // 44px de alto: por debajo de eso, en un teléfono se
                    // toca la opción de al lado.
                    'relative flex min-h-11 w-full cursor-default items-center gap-2 rounded-lg py-2 pr-8 pl-2.5 text-sm outline-none select-none',
                    'data-highlighted:bg-accent data-highlighted:text-accent-foreground'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint && (
                    <span className="shrink-0 text-xs text-muted-foreground">{option.hint}</span>
                  )}
                  <Combobox.ItemIndicator className="absolute right-2.5 flex size-4 items-center justify-center">
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

export { Picker };
