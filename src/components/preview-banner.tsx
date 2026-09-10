'use client';

import { useState } from 'react';
import { useFinanceStore } from '@/stores/finance-store';
import { ROLE_LABEL } from '@/lib/types';
import { Eye, X } from 'lucide-react';

/**
 * Franja fija mientras se está viendo la app como otro rol.
 *
 * Va arriba de todo y no se puede ignorar a propósito: alguien que se olvida de
 * que está en vista previa cree que le faltan permisos, o peor, cree que un
 * dato desapareció. Salir tiene que estar siempre a un clic.
 */
export function PreviewBanner() {
  const previewRole = useFinanceStore((s) => s.previewRole);
  const setPreviewRole = useFinanceStore((s) => s.setPreviewRole);
  const [saliendo, setSaliendo] = useState(false);

  if (!previewRole) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 bg-primary px-4 py-1.5 text-primary-foreground">
      <Eye className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 truncate text-xs font-medium">
        Estás viendo la app como <strong>{ROLE_LABEL[previewRole]}</strong>. No es tu rol real.
      </p>
      <button
        type="button"
        disabled={saliendo}
        onClick={async () => {
          setSaliendo(true);
          try {
            await setPreviewRole(null);
          } finally {
            setSaliendo(false);
          }
        }}
        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors hover:bg-primary-foreground/15 disabled:opacity-60"
      >
        <X className="size-3.5" />
        {saliendo ? 'Saliendo…' : 'Salir'}
      </button>
    </div>
  );
}
