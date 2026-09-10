'use client';

import { useToastStore, type ToastTone } from '@/stores/toast-store';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

const ICON: Record<ToastTone, React.ElementType> = {
  error: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

const TONE: Record<ToastTone, string> = {
  error: 'bg-expense text-background',
  success: 'bg-income text-background',
  info: 'bg-foreground text-background',
};

/**
 * Canal de aviso de las escrituras optimistas: la app aplica el cambio al
 * instante y confirma contra el servidor después, así que cuando el servidor
 * rechaza algo el cambio se deshace y hay que decirlo. Sin esto, una fila
 * aparecería y se esfumaría sin explicación.
 *
 * Va por encima del bottom nav de mobile para no quedar tapado.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-md animate-slide-up items-center gap-3 rounded-2xl px-4 py-3 shadow-soft-md',
              TONE[t.tone]
            )}
          >
            <Icon className="size-4 shrink-0" />
            <p className="min-w-0 flex-1 text-sm font-medium">{t.message}</p>

            {t.action && (
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
                  t.action!.run();
                }}
                className="shrink-0 rounded-lg px-2.5 py-1 text-sm font-semibold underline underline-offset-2"
              >
                {t.action.label}
              </button>
            )}

            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Cerrar aviso"
              className="shrink-0 rounded-lg p-1 opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
