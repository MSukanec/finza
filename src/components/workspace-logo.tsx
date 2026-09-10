'use client';

import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Workspace } from '@/lib/types';

/**
 * El logo del espacio, o el ícono por defecto si todavía no cargaron uno.
 *
 * Con varios espacios abiertos —un restaurante, las finanzas personales— el
 * logo es lo que dice de un vistazo dónde estás parado antes de cargar algo en
 * el lugar equivocado.
 */
export function WorkspaceLogo({
  workspace,
  size = 'default',
  className,
}: {
  workspace?: Workspace | null;
  size?: 'default' | 'lg';
  className?: string;
}) {
  const [fallo, setFallo] = useState(false);
  const px = size === 'lg' ? 'size-14' : 'size-9';

  if (workspace?.logo_url && !fallo) {
    return (
      <img
        src={workspace.logo_url}
        alt={workspace.name}
        onError={() => setFallo(true)}
        className={cn('shrink-0 rounded-xl object-cover', px, className)}
      />
    );
  }

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground',
        px,
        className
      )}
    >
      <Wallet className={size === 'lg' ? 'size-6' : 'size-4'} />
    </span>
  );
}
