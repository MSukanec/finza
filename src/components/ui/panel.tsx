import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Panel: la superficie de contenido de la app.
 *
 * Recibe título, descripción, ícono y acciones como props en vez de que cada
 * vista arme su propio encabezado a mano — que es lo que hacía que dos tarjetas
 * vecinas tuvieran tipografías y espaciados distintos.
 *
 * El encabezado se separa del contenido con una línea fina cuando hay ambos.
 * Sin título, el panel es solo una superficie.
 */
export function Panel({
  icon: Icon,
  title,
  description,
  actions,
  footer,
  children,
  divided = true,
  padded = true,
  className,
  bodyClassName,
}: {
  icon?: React.ElementType;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  /** Línea entre encabezado y contenido. */
  divided?: boolean;
  /** Padding del contenido. Apagalo para listas o tablas a sangre. */
  padded?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const hasHeader = Boolean(title || actions);

  return (
    <section
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-2xl bg-card text-card-foreground shadow-soft-xs',
        className
      )}
    >
      {hasHeader && (
        <header
          className={cn(
            'flex items-start gap-3 px-4 py-3 md:px-5',
            divided && children && 'border-b border-border/60'
          )}
        >
          {Icon && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-4" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>

          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}

      {children && (
        <div className={cn('min-h-0 flex-1', padded && 'px-4 py-4 md:px-5', bodyClassName)}>
          {children}
        </div>
      )}

      {footer && (
        <footer className="border-t border-border/60 bg-muted/30 px-4 py-3 md:px-5">
          {footer}
        </footer>
      )}
    </section>
  );
}

/** Etiqueta chica en mayúsculas, para KPIs y encabezados de dato. */
export function PanelLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground',
        className
      )}
    >
      {children}
    </p>
  );
}

/**
 * Kpi: la otra forma canónica, para una sola cifra.
 *
 * Comparte la superficie con Panel pero NO su encabezado: acá el número es el
 * contenido, no hay título arriba de una línea divisoria. Por eso son dos
 * componentes y no un modo de uno solo.
 */
export function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'neutral',
  delta,
  deltaInverted,
  action,
  className,
}: {
  icon?: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  tone?: 'income' | 'expense' | 'neutral' | 'warning';
  delta?: number | null;
  /** En egresos, subir es malo. */
  deltaInverted?: boolean;
  /** Control propio del KPI, arriba a la derecha. */
  action?: React.ReactNode;
  className?: string;
}) {
  const bad = delta != null && (deltaInverted ? delta > 0 : delta < 0);

  return (
    <div className={cn('rounded-2xl bg-card p-4 shadow-soft-xs md:p-5', className)}>
      {(Icon || action) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          {Icon ? (
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-xl',
                tone === 'income' && 'bg-income/10 text-income',
                tone === 'expense' && 'bg-expense/10 text-expense',
                tone === 'warning' && 'bg-warning/10 text-warning',
                tone === 'neutral' && 'bg-accent text-accent-foreground'
              )}
            >
              <Icon className="size-4" />
            </span>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}

      <PanelLabel>{label}</PanelLabel>

      <p
        className={cn(
          'mt-1 truncate text-xl font-semibold tracking-tight tabular-nums md:text-2xl',
          tone === 'income' && 'text-income',
          tone === 'expense' && 'text-expense'
        )}
      >
        {value}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta != null && (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
              bad ? 'bg-expense/10 text-expense' : 'bg-income/10 text-income'
            )}
          >
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        )}
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
