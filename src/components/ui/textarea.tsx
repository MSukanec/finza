'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Campo de texto multilínea que crece con el contenido.
 *
 * La descripción de un movimiento es una factura entera —"Pescadería Mar del
 * Plata - FC 1083 - Pedido del 4 de septiembre. Pagado con cheque."— y en un
 * <input> de una línea el usuario escribe a ciegas: sólo ve el final.
 *
 * Crece hasta `maxRows` y recién ahí scrollea, así el formulario no se
 * desborda cuando alguien pega tres párrafos.
 */
function Textarea({
  className,
  rows = 1,
  maxRows = 5,
  onChange,
  value,
  ...props
}: React.ComponentProps<'textarea'> & { maxRows?: number }) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  const resize = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;

    // Se mide desde cero: sin esto la altura sólo puede crecer, y al borrar
    // texto el campo queda grande.
    el.style.height = 'auto';

    const estilo = window.getComputedStyle(el);
    const linea = parseFloat(estilo.lineHeight) || 20;
    const relleno = parseFloat(estilo.paddingTop) + parseFloat(estilo.paddingBottom);
    const tope = linea * maxRows + relleno;

    el.style.height = `${Math.min(el.scrollHeight, tope)}px`;
    el.style.overflowY = el.scrollHeight > tope ? 'auto' : 'hidden';
  }, [maxRows]);

  // Corre también cuando el valor cambia desde afuera (abrir el modal para
  // editar un movimiento que ya tiene texto largo).
  React.useLayoutEffect(resize, [resize, value]);

  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      rows={rows}
      value={value}
      onChange={(e) => {
        resize();
        onChange?.(e);
      }}
      className={cn(
        'w-full min-w-0 resize-none rounded-xl border border-input bg-card/60 px-3.5 py-2 text-base leading-5 transition-[color,box-shadow,border-color] outline-none',
        'placeholder:text-muted-foreground hover:border-ring/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'md:text-sm dark:bg-input/30',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
