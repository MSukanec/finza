'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Sección plegable.
 *
 * El encabezado es un <button> de verdad y no un <div role="button">: así
 * llegan gratis el foco, Enter, barra espaciadora y el anuncio correcto al
 * lector de pantalla. La versión anterior simulaba todo eso a mano, sin estilo
 * de foco —se podía tabular hasta el encabezado sin ver nada— y sin
 * `aria-expanded`, así que no había forma de saber si estaba abierto.
 */
export function SimpleAccordion({
  title,
  summary,
  children,
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
  actions,
}: {
  title: React.ReactNode;
  summary?: React.ReactNode;
  /**
   * Botones del encabezado (renombrar, borrar). Van AFUERA del botón que
   * abre y cierra: un <button> dentro de otro es HTML inválido, el navegador
   * lo reacomoda a su manera y React falla al hidratar. Además, tocar
   * "borrar" no tiene que abrir la sección.
   */
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
  const panelId = useId();

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const handleToggle = () => {
    if (isControlled) onToggle?.();
    else setInternalIsOpen((prev) => !prev);
  };

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft-xs">
      <div className="group flex items-stretch bg-accent/20 transition-colors hover:bg-accent/40">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={cn(
          'flex min-w-0 flex-1 select-none items-center gap-3 p-4 text-left',
          'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
        )}
      >
        {/* Un solo ícono que gira. Cambiar de ChevronRight a ChevronDown hacía
            saltar el ancho del encabezado al abrir y cerrar. */}
        <ChevronDown
          className={cn(
            'size-5 shrink-0 text-muted-foreground transition-transform duration-200',
            !isOpen && '-rotate-90'
          )}
          aria-hidden
        />

        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
          {title}
          {summary && <span className="shrink-0 text-right">{summary}</span>}
        </span>
      </button>
      {actions && <div className="flex shrink-0 items-center pr-2">{actions}</div>}
      </div>

      {isOpen && (
        <div id={panelId} className="border-t border-border/60 bg-card">
          {children}
        </div>
      )}
    </div>
  );
}
