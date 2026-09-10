'use client';

import { useState } from 'react';
import { useFinanceStore } from '@/stores/finance-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function UserProfile({ className }: { className?: string }) {
  const user = useFinanceStore((s) => s.user);
  const logout = useFinanceStore((s) => s.logout);
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) return null;

  const name: string = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario';
  const email: string = user.email ?? '';
  const avatarUrl: string | undefined = user.user_metadata?.avatar_url;
  const initials = name.trim().slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      // Recarga completa para que no quede nada del estado anterior en memoria.
      window.location.href = '/login';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Abrir menú de usuario"
        className={cn(
          'flex w-full items-center gap-3 rounded-xl p-1.5 text-left outline-none transition-colors',
          'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
      >
        <Avatar name={name} initials={initials} url={avatarUrl} />
        <span className="hidden min-w-0 flex-1 md:block">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar name={name} initials={initials} url={avatarUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          disabled={loggingOut}
          className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="mr-2 size-4" />
          {loggingOut ? 'Cerrando…' : 'Cerrar sesión'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Avatar propio en vez del primitivo de Base UI: es una imagen con fallback y no
 * necesita contexto ni portal, así que no puede romper dentro del trigger del menú.
 */
function Avatar({ name, initials, url }: { name: string; initials: string; url?: string }) {
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-9 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {initials || <UserIcon className="size-4" />}
    </span>
  );
}
