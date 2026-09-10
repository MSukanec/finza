'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Campo canónico de los formularios.
 *
 * La etiqueta va DENTRO del recuadro, no arriba. Antes cada campo gastaba
 * ~72px —etiqueta (16) + separación (8) + control (48)— más 20px de aire entre
 * campos: un formulario de siete campos pedía 640px y en una pantalla baja
 * había que scrollear para llegar al botón. Con la etiqueta adentro el mismo
 * campo entra en 52px y no se pierde nada de información.
 *
 * El borde y el foco viven en el contenedor; el control de adentro se dibuja
 * transparente para que los dos se lean como una sola pieza.
 */
function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string;
  /** Aclaración corta, a la derecha de la etiqueta. */
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div
        className={cn(
          'group relative rounded-xl border border-input bg-card/60 px-3.5 pt-1.5 pb-1 transition-[color,box-shadow,border-color]',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25',
          'hover:border-ring/40',
          error && 'border-destructive focus-within:border-destructive focus-within:ring-destructive/20',

          // El control de adentro pierde su propia caja: el recuadro es el del
          // campo. Se apunta por `data-slot` para que valga igual para input,
          // textarea y el trigger del select sin que cada form lo repita.
          '[&_[data-slot=input]]:h-7 [&_[data-slot=input]]:rounded-none [&_[data-slot=input]]:border-0 [&_[data-slot=input]]:bg-transparent [&_[data-slot=input]]:px-0 [&_[data-slot=input]]:py-0 [&_[data-slot=input]]:text-[15px] [&_[data-slot=input]]:shadow-none focus-within:[&_[data-slot=input]]:ring-0 [&_[data-slot=input]]:focus-visible:ring-0 [&_[data-slot=input]]:focus-visible:border-0',
          '[&_[data-slot=textarea]]:rounded-none [&_[data-slot=textarea]]:border-0 [&_[data-slot=textarea]]:bg-transparent [&_[data-slot=textarea]]:px-0 [&_[data-slot=textarea]]:py-0 [&_[data-slot=textarea]]:text-[15px] [&_[data-slot=textarea]]:shadow-none [&_[data-slot=textarea]]:focus-visible:ring-0',
          '[&_[data-slot=select-trigger]]:h-7 [&_[data-slot=select-trigger]]:rounded-none [&_[data-slot=select-trigger]]:border-0 [&_[data-slot=select-trigger]]:bg-transparent [&_[data-slot=select-trigger]]:px-0 [&_[data-slot=select-trigger]]:text-[15px] [&_[data-slot=select-trigger]]:shadow-none [&_[data-slot=select-trigger]]:focus-visible:ring-0'
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <label
            htmlFor={htmlFor}
            className="pointer-events-none block text-[11px] font-medium tracking-wide text-muted-foreground"
          >
            {label}
          </label>
          {hint && <span className="shrink-0 text-[11px] text-muted-foreground">{hint}</span>}
        </div>

        {children}
      </div>

      {error && <p className="mt-1 px-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Dos campos por fila en pantallas con lugar, uno debajo del otro en mobile.
 * Es lo que más alto ahorra: dos campos cortos —monto y fecha, grupo y
 * categoría— no necesitan una fila entera cada uno.
 */
function FieldRow({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', className)}>{children}</div>;
}

export { Field, FieldRow };
