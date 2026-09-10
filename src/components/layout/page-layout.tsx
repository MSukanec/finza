import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageLayoutProps {
  title: string;
  /** Una línea de contexto. Va al lado del título en desktop para no ganar altura. */
  description?: string;
  icon?: React.ElementType;
  /**
   * TODO lo interactivo de la página: filtros, búsqueda, selectores y botones.
   * Va alineado a la derecha, en la misma y única fila del header.
   */
  actions?: ReactNode;
  children: ReactNode;
  /** Quita el padding y la separación del body, para vistas que manejan lo suyo. */
  bare?: boolean;
  className?: string;
}

/**
 * Estructura de página de toda la app.
 *
 * El header NO scrollea, y no por `sticky`: está fuera del contenedor que
 * scrollea. Antes vivía adentro y necesitaba márgenes negativos para tapar el
 * contenido que pasaba por debajo, lo que además dejaba el borde desalineado.
 *
 * El header mide siempre lo mismo (56px) y tiene UNA fila. Todo control
 * —botones, filtros, buscador, selectores de rango— va en `actions`, alineado a
 * la derecha. El body es solo contenido: sin botoneras ni barras de filtros.
 *
 * REGLA de ancho: nada acá adentro puede ensanchar la página. El contenedor de
 * `actions` NO lleva `shrink-0`; si no entra, algo dentro tiene que ceder
 * (esconderse en un breakpoint más alto, o encogerse). Cuando llevaba
 * `shrink-0`, su ancho máximo pasaba a ser el mínimo de toda la página: entre
 * 1024px y ~1250px los filtros de Movimientos no entraban, la página crecía
 * más que la pantalla y el botón de la derecha quedaba recortado fuera de la
 * vista. Se leía como "desapareció el botón Nuevo".
 */
export function PageLayout({
  title,
  description,
  icon: Icon,
  actions,
  children,
  bare,
  className,
}: PageLayoutProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="shrink-0 border-b border-border/60 bg-background">
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          {Icon && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-4" strokeWidth={2} />
            </span>
          )}

          {/* El título cede el espacio primero: se trunca para que los
              controles de la derecha entren siempre enteros. */}
          <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
            <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="hidden truncate text-sm text-muted-foreground lg:block">{description}</p>
            )}
          </div>

          {actions && <div className="flex min-w-0 items-center gap-2">{actions}</div>}
        </div>
      </header>

      <div
        className={cn(
          // `overflow-x-hidden` es la red de contención: ningún contenido del
          // body puede sacar una barra horizontal ni ensanchar la página.
          'custom-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden',
          // Separación por defecto entre los bloques del body. Ninguna vista
          // debería declarar su propio gap: si dos tarjetas quedan pegadas, es
          // porque alguien envolvió el contenido en un div y rompió el ritmo.
          !bare && 'space-y-4 px-4 py-4 pb-24 md:space-y-5 md:px-6 md:py-5 md:pb-8',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
