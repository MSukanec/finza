'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { usePresence } from '@/hooks/use-presence';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Cuántas caras se muestran antes de resumir en "+N". */
const VISIBLES = 4;

/**
 * Quién más está con la app abierta en este espacio.
 *
 * No es un adorno: si dos socios editan el mismo movimiento a la vez, gana el
 * último en guardar y el otro no se entera. Ver que hay alguien más adentro es
 * lo que evita esa pisada.
 */
export function PresenceBar({ className }: { className?: string }) {
  const workspaceId = useFinanceStore((s) => s.currentWorkspaceId);
  const appUserId = useFinanceStore((s) => s.appUserId);
  const people = useFinanceStore((s) => s.people);

  const yo = appUserId ? (people[appUserId] ?? null) : null;
  const otros = usePresence(workspaceId, yo);

  if (!yo) return null;

  // Uno mismo va primero y siempre: si sólo apareciera cuando hay alguien más,
  // estando solo no habría forma de saber si esto funciona o si está roto.
  const conectados = [yo, ...otros];
  const visibles = conectados.slice(0, VISIBLES);
  const resto = conectados.length - visibles.length;

  return (
    <TooltipProvider>
      <div className={cn('flex items-center gap-2', className)}>
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-income opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-income" />
        </span>

        {/* Superpuestas: ocupan poco y se lee de una que son varias personas. */}
        <div className="flex -space-x-2">
          {visibles.map((p) => (
            <Tooltip key={p.id}>
              <TooltipTrigger
                render={
                  <span className="rounded-full ring-2 ring-sidebar transition-transform hover:z-10 hover:scale-110">
                    <UserAvatar person={p} size="sm" />
                  </span>
                }
              />
              <TooltipContent side="top">
                <p className="font-medium">
                  {p.id === yo.id ? 'Vos' : p.full_name || p.email}
                </p>
                <p className="text-xs opacity-80">
                  {p.id === yo.id ? 'Sos vos' : 'Está en la app ahora'}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}

          {resto > 0 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-sidebar">
                    +{resto}
                  </span>
                }
              />
              <TooltipContent side="top">
                {conectados.slice(VISIBLES).map((p) => (
                  <p key={p.id}>{p.full_name || p.email}</p>
                ))}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <span className="truncate text-xs text-muted-foreground">
          {otros.length === 0
            ? 'Sólo vos'
            : otros.length === 1
              ? `Vos y ${(otros[0].full_name || otros[0].email).split(' ')[0]}`
              : `Vos y ${otros.length} más`}
        </span>
      </div>
    </TooltipProvider>
  );
}
