'use client';

import { useEffect, useState } from 'react';
import { useFinanceStore } from '@/stores/finance-store';
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalDescription,
  ResponsiveModalBody,
} from '@/components/ui/responsive-modal';
import { UserAvatar } from '@/components/ui/user-avatar';
import { cn } from '@/lib/utils';
import { haceCuanto, esDeHoy } from '@/lib/tiempo';
import type { RegisteredUser } from '@/lib/types';
import { Shield, Eye, RefreshCw } from 'lucide-react';

const esReciente = esDeHoy;

/**
 * Quién se registró en la app.
 *
 * Son datos de CUENTA y nada de plata: no hay movimientos, saldos ni espacios
 * ajenos acá. Esconder el botón es presentación; lo que realmente impide leer
 * esto es que `admin_list_users` corta por `is_admin` en la base, y esa columna
 * no se puede cambiar desde el cliente.
 */
export function AdminPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const loadRegisteredUsers = useFinanceStore((s) => s.loadRegisteredUsers);
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const traer = () => {
    setCargando(true);
    setError(null);
    loadRegisteredUsers()
      .then(setUsers)
      .catch((e) => setError(e?.message || 'No se pudo cargar.'))
      .finally(() => setCargando(false));
  };

  // Esto es lo que un efecto tiene que hacer: sincronizar con un sistema
  // externo. El estado que se toca es el de la propia carga, no un valor
  // derivable de las props.
  useEffect(() => {
    if (open) traer();
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  }, [open]);

  const nuevos = users.filter((u) => esReciente(u.created_at)).length;

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="sm:max-w-lg">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Usuarios registrados</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {cargando
              ? 'Cargando…'
              : `${users.length} ${users.length === 1 ? 'cuenta' : 'cuentas'}` +
                (nuevos > 0 ? ` · ${nuevos} en las últimas 24 h` : '')}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <ResponsiveModalBody className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 p-2.5">
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Eye className="mt-0.5 size-3.5 shrink-0" />
              Sólo vos ves esto. Son datos de cuenta: no incluye plata ni espacios de nadie.
            </p>
            <button
              type="button"
              onClick={traer}
              disabled={cargando}
              aria-label="Actualizar"
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <RefreshCw className={cn('size-4', cargando && 'animate-spin')} />
            </button>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {!error && users.length === 0 && !cargando && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Todavía no hay nadie registrado.
            </p>
          )}

          <ul className="divide-y divide-border/60">
            {users.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5">
                <UserAvatar
                  person={{
                    id: u.id,
                    full_name: u.full_name,
                    email: u.email,
                    avatar_url: u.avatar_url,
                  }}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium leading-tight">
                      {u.full_name || u.email}
                    </p>
                    {esReciente(u.created_at) && (
                      <span className="shrink-0 rounded-md bg-income/10 px-1.5 py-0.5 text-[10px] font-semibold text-income">
                        NUEVO
                      </span>
                    )}
                    {u.is_admin && (
                      <Shield className="size-3.5 shrink-0 text-primary" aria-label="Administrador" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {u.full_name ? `${u.email} · ` : ''}
                    {u.espacios === 0
                      ? u.invitado
                        ? 'invitado, sin aceptar'
                        : 'sin espacios'
                      : `${u.espacios} ${u.espacios === 1 ? 'espacio' : 'espacios'}`}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">{haceCuanto(u.last_sign_in)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                    {new Date(u.created_at).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </ResponsiveModalBody>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
