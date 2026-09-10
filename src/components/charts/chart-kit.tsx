'use client';

import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money';
import type { Currency } from '@/lib/types';
import { Panel } from '@/components/ui/panel';

/**
 * Sistema de gráficos
 * ===================
 * Una sola fuente para tooltip, ejes, colores, leyenda y vacíos. Todo gráfico
 * de la app se arma con estas piezas: si acá se cambia el tooltip o un token,
 * cambian todos los gráficos a la vez.
 *
 * Regla de color: los tokens --chart-1..5 están VALIDADOS como paleta
 * categórica (separación bajo daltonismo, contraste, croma). Se asignan SIEMPRE
 * en orden fijo y nunca se ciclan: una novena serie va a "Otros", no a un color
 * inventado. Ver el comentario en globals.css antes de tocarlos.
 */

/** Orden fijo. El índice es la identidad de la serie, no su ranking. */
export const SERIES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

/** Colores semánticos: significan una cosa concreta y no se reciclan como "serie 4". */
export const TONE = {
  income: 'var(--income)',
  expense: 'var(--expense)',
  transfer: 'var(--transfer)',
  neutral: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
} as const;

export const MAX_SERIES = SERIES.length;

/** Toma los N mayores y agrupa el resto en "Otros" en vez de ciclar colores. */
export function topNWithOther<T extends { value: number }>(
  items: T[],
  n: number,
  makeOther: (value: number, count: number) => T
): T[] {
  if (items.length <= n) return items;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, n - 1);
  const tail = sorted.slice(n - 1);
  const rest = tail.reduce((s, i) => s + i.value, 0);
  return [...head, makeOther(rest, tail.length)];
}

// ---------------------------------------------------------------- formato

/** 1.234.567 → "1,2 M". Los ejes necesitan orden de magnitud, no precisión. */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1).replace('.', ',')} MM`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1).replace('.', ',')} M`;
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3)} k`;
  return `${sign}${Math.round(abs)}`;
}

// ---------------------------------------------------------------- ejes

/** Ejes recesivos: el dato manda, la grilla acompaña. */
export const AXIS = {
  axisLine: false as const,
  tickLine: false as const,
  tick: { fill: 'var(--muted-foreground)', fontSize: 11 },
};

export const GRID = {
  stroke: 'var(--border)',
  strokeDasharray: '3 3',
  vertical: false as const,
};

/**
 * Props del ResponsiveContainer de todos los gráficos.
 *
 * `initialDimension` es lo importante: el default de Recharts es
 * { width: -1, height: -1 }, así que en el primer render —antes de que el
 * ResizeObserver mida— el gráfico recibe un ancho NEGATIVO. El Brush arma su
 * escala con `range([x, x + width - travellerWidth])` y con ancho negativo la
 * posición de las manijas sale NaN, que es el error que aparecía en consola.
 *
 * Los valores son sólo el punto de partida del primer frame: apenas mide, los
 * reemplaza por los reales.
 */
export const CHART_CONTAINER = {
  width: '100%' as const,
  height: '100%' as const,
  minWidth: 0,
  initialDimension: { width: 600, height: 300 },
};

export const CURSOR_BAR = { fill: 'var(--accent)', opacity: 0.35 };
export const CURSOR_LINE = { stroke: 'var(--border)', strokeWidth: 1 };

// ---------------------------------------------------------------- tooltip

type TooltipEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
};

/**
 * Tooltip único de la app. Recharts lo llama con su propio contrato; se acepta
 * `any` en el borde y se normaliza acá adentro.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  currency,
  labelFormatter,
  nameFormatter,
  hideName,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: unknown;
  currency: Currency;
  labelFormatter?: (label: unknown, payload?: TooltipEntry[]) => string;
  nameFormatter?: (name: string) => string;
  /** Para una serie sola: el título del gráfico ya la nombra. */
  hideName?: boolean;
}) {
  if (!active || !payload?.length) return null;

  const rows = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (!rows.length) return null;

  const heading = labelFormatter ? labelFormatter(label, payload) : String(label ?? '');

  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-sm shadow-soft-md">
      {heading && <p className="mb-1.5 text-xs text-muted-foreground">{heading}</p>}
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            {!hideName && (
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: row.color || 'var(--foreground)' }}
              />
            )}
            {!hideName && (
              <span className="text-muted-foreground">
                {nameFormatter ? nameFormatter(String(row.name ?? '')) : String(row.name ?? '')}
              </span>
            )}
            {/* El valor va en tinta, nunca en el color de la serie. */}
            <span className="ml-auto font-medium tabular-nums text-foreground">
              {formatMoney(Number(row.value ?? 0), currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- leyenda

/** Obligatoria desde 2 series: la identidad nunca puede depender sólo del color. */
export function ChartLegend({
  items,
  className,
}: {
  items: { label: string; color: string }[];
  className?: string;
}) {
  if (items.length < 2) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- contenedor

export function ChartCard({
  title,
  subtitle,
  icon,
  legend,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  legend?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  // Se apoya en Panel para que un gráfico tenga exactamente el mismo encabezado
  // que cualquier otra tarjeta de la app.
  return (
    <Panel
      icon={icon}
      title={title}
      description={subtitle}
      actions={actions}
      className={className}
      bodyClassName={bodyClassName}
    >
      {legend && <div className="mb-3">{legend}</div>}
      {children}
    </Panel>
  );
}

export function ChartEmpty({ message = 'Sin datos para el período elegido' }: { message?: string }) {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
