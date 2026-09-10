'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFinanceStore } from '@/stores/finance-store';
import { Lock } from 'lucide-react';

/**
 * Esconde una sección de los usuarios que no son administradores.
 *
 * Es una puerta de INTERFAZ, no de datos: sirve para no ofrecer pantallas que
 * todavía no están listas. Lo que impide ver información ajena sigue siendo
 * RLS en la base, no este componente.
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isHydrated = useFinanceStore((s) => s.isHydrated);
  const isAdmin = useFinanceStore((s) => s.isAdmin);

  useEffect(() => {
    if (isHydrated && !isAdmin) router.replace('/dashboard');
  }, [isHydrated, isAdmin, router]);

  if (!isHydrated) return null;

  if (!isAdmin) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-muted">
          <Lock className="size-5 text-muted-foreground" />
        </span>
        <p className="text-sm font-medium">Sección no disponible</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Todavía estamos trabajando en esta parte. Te llevamos al inicio.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
