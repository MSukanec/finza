'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Fecha (o mes) con el valor a la derecha, como cualquier otro campo.
 *
 * El `<input type="date">` nativo ignora `text-align`: dibuja la fecha en una
 * parte interna que el navegador no deja alinear, así que dentro de un campo
 * quedaba pegada a la etiqueta mientras todo lo demás iba contra el borde
 * derecho.
 *
 * Acá el valor lo dibuja un texto común, alineado a la derecha, y el input
 * nativo va encima, invisible, ocupando todo el tramo: tocar en cualquier lado
 * abre el calendario del sistema (la rueda del iPhone, el calendario de
 * Chrome), que es lo que conviene en cada dispositivo. `showPicker()` hace
 * falta en escritorio, donde un clic sobre el texto de un input de fecha edita
 * los números en vez de abrir el calendario.
 */
function DateInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'date',
  disabled,
  className,
}: {
  id?: string;
  /** 'YYYY-MM-DD' o, con `type="month"`, 'YYYY-MM'. Vacío si no hay. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'date' | 'month';
  disabled?: boolean;
  className?: string;
}) {
  const texto = value ? formatear(value, type) : placeholder ?? (type === 'month' ? 'mm/aaaa' : 'dd/mm/aaaa');

  return (
    <div data-slot="date-input" className={cn('relative flex min-w-0 items-center justify-end gap-2 py-2', className)}>
      <span
        className={cn(
          'truncate text-right text-base tabular-nums md:text-[15px]',
          !value && 'text-muted-foreground'
        )}
      >
        {texto}
      </span>
      <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            // Navegadores sin showPicker abren el calendario solos al tocar.
          }
        }}
        // 16px aunque no se vea: Safari hace zoom al enfocar un input más chico.
        className="absolute inset-0 h-full w-full cursor-pointer text-base opacity-0 disabled:cursor-default"
      />
    </div>
  );
}

/** '2026-09-17' → '17/09/2026'; '2026-09' → '09/2026'. */
function formatear(valor: string, type: 'date' | 'month'): string {
  const [anio, mes, dia] = valor.split('-');
  if (type === 'month') return mes && anio ? `${mes}/${anio}` : valor;
  return dia && mes && anio ? `${dia}/${mes}/${anio}` : valor;
}

export { DateInput };
