'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * La fila del campo, para que lo que se abra desde adentro se mida contra ella.
 *
 * Un desplegable se ancla a su disparador, y adentro de un campo el disparador
 * es sólo el tramo a la derecha de la etiqueta. Así la lista salía más angosta
 * que el campo y corrida hacia la derecha: se leía como un error de dibujo.
 * Con la fila como ancla, la lista mide exactamente lo mismo que el campo del
 * que salió.
 *
 * Es un contexto y no una prop porque el campo no sabe qué le meten adentro.
 */
const AnclaDelCampo = React.createContext<HTMLElement | null>(null);

/** La fila del campo que envuelve a este control, si hay una. */
function useAnclaDelCampo(): HTMLElement | null {
  return React.useContext(AnclaDelCampo);
}

/**
 * Campo canónico de los formularios.
 *
 * Una fila: la etiqueta a la izquierda, el valor a la derecha. Nada de
 * etiqueta arriba y control abajo — eso duplicaba el alto de cada campo sin
 * agregar información, y un formulario de siete campos terminaba pidiendo
 * scroll en una pantalla baja.
 *
 * El borde y el foco viven en el contenedor; el control de adentro se dibuja
 * transparente y alineado a la derecha, para que los dos se lean como una
 * sola pieza.
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
  /** Sufijo corto pegado al valor: la moneda, un atajo. */
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  // Estado y no `useRef`: el hijo tiene que re-renderizar cuando aparece la
  // fila, y una ref cambia sin avisarle a nadie.
  const [fila, setFila] = React.useState<HTMLElement | null>(null);

  return (
    <div className={cn('min-w-0', className)}>
      <div
        ref={setFila}
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-xl border border-input bg-card/60 pl-3.5 pr-3 transition-[color,box-shadow,border-color]',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25',
          'hover:border-ring/40',
          error && 'border-destructive focus-within:border-destructive focus-within:ring-destructive/20',

          // 16px en el teléfono (`text-base`), 15 de md para arriba. NO es
          // capricho: Safari en iPhone hace zoom sobre cualquier input de
          // menos de 16px al enfocarlo, y el zoom deja el formulario a medio
          // salir de la pantalla. `input.tsx` ya lo hacía bien; este archivo
          // lo pisaba con 15px fijos y devolvía el salto.
          //
          // El control de adentro pierde su propia caja y se alinea a la
          // derecha: el recuadro es el del campo. Se apunta por `data-slot`
          // para que valga igual para input, textarea y el desplegable sin que
          // cada formulario lo repita.
          '[&_[data-slot=input]]:h-auto [&_[data-slot=input]]:rounded-none [&_[data-slot=input]]:border-0 [&_[data-slot=input]]:bg-transparent [&_[data-slot=input]]:px-0 [&_[data-slot=input]]:py-2 [&_[data-slot=input]]:text-right [&_[data-slot=input]]:text-base [&_[data-slot=input]]:md:text-[15px] [&_[data-slot=input]]:shadow-none [&_[data-slot=input]]:focus-visible:ring-0',
          // La descripción es la excepción a la alineación derecha: un texto
          // largo que envuelve —"Pescadería Mar del Plata - FC 1083 - Pedido
          // del 4 de septiembre"— alineado a la derecha no se lee.
          //
          // Pero VACÍA no es una excepción a nada: el "¿En qué fue?" pegado a
          // la etiqueta quedaba flotando en el medio de la fila, cuando en
          // todos los demás campos lo que se ve al lado de la etiqueta está
          // contra el borde derecho. Así que el hueco va a la derecha como en
          // el resto, y la alineación cambia sola con la primera letra, que es
          // cuando aparece un párrafo que hay que leer.
          '[&_[data-slot=textarea]:placeholder-shown]:text-right',
          '[&_[data-slot=textarea]]:rounded-none [&_[data-slot=textarea]]:border-0 [&_[data-slot=textarea]]:bg-transparent [&_[data-slot=textarea]]:px-0 [&_[data-slot=textarea]]:py-2.5 [&_[data-slot=textarea]]:text-base [&_[data-slot=textarea]]:md:text-[15px] [&_[data-slot=textarea]]:shadow-none [&_[data-slot=textarea]]:focus-visible:ring-0',
          '[&_[data-slot=picker-trigger]]:h-auto [&_[data-slot=picker-trigger]]:rounded-none [&_[data-slot=picker-trigger]]:border-0 [&_[data-slot=picker-trigger]]:bg-transparent [&_[data-slot=picker-trigger]]:px-0 [&_[data-slot=picker-trigger]]:py-2 [&_[data-slot=picker-trigger]]:text-base [&_[data-slot=picker-trigger]]:md:text-[15px] [&_[data-slot=picker-trigger]]:focus-visible:ring-0',
          // El texto del desplegable también va a la derecha, pegado a su flecha.
          '[&_[data-slot=picker-trigger]>span]:text-right'
        )}
      >
        <label
          htmlFor={htmlFor}
          className="shrink-0 text-sm text-muted-foreground"
        >
          {label}
        </label>

        <div className="min-w-0 flex-1">
          <AnclaDelCampo.Provider value={fila}>{children}</AnclaDelCampo.Provider>
        </div>

        {hint && (
          <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>
        )}
      </div>

      {error && <p className="mt-1 px-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export { Field, useAnclaDelCampo };
