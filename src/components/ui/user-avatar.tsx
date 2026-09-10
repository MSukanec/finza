'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';
import type { Person } from '@/lib/types';

/**
 * Avatar de una persona. Imagen si la hay, si no las iniciales.
 *
 * `person` puede venir indefinido: pasa cuando el cambio lo hizo el servidor
 * (una migración, un script) o cuando el autor ya no es miembro del espacio.
 * En ese caso se muestra un genérico en vez de romper.
 */
export function UserAvatar({
  person,
  size = 'default',
  className,
}: {
  person?: Person | null;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  const px = size === 'sm' ? 'size-7 text-[10px]' : size === 'lg' ? 'size-10 text-sm' : 'size-9 text-xs';
  const name = person?.full_name || person?.email || '';
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const title = name || 'Sistema';

  if (person?.avatar_url && !failed) {
    return (
      <img
        src={person.avatar_url}
        alt={title}
        title={title}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn('shrink-0 rounded-full object-cover', px, className)}
      />
    );
  }

  return (
    <span
      title={title}
      aria-label={title}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        person ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        px,
        className
      )}
    >
      {initials || <User className="size-4" />}
    </span>
  );
}

/** Nombre corto para mostrar al lado del avatar. */
export function personName(person?: Person | null): string {
  if (!person) return 'Sistema';
  return person.full_name?.split(' ')[0] || person.email.split('@')[0];
}
