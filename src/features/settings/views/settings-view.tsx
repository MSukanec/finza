'use client';

import { useEffect, useState } from 'react';
import { useFinanceStore } from '@/stores/finance-store';
import { PageLayout } from '@/components/layout/page-layout';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { cn } from '@/lib/utils';
import { ROLE_LABEL, ROLE_HINT, type WorkspaceRole } from '@/lib/types';
import { Settings, Users, Eye, ShieldCheck, Info } from 'lucide-react';
import { LogoUploader } from '../components/logo-uploader';

/** Todos los roles, aunque todavía nadie los tenga. */
const ROLES: WorkspaceRole[] = ['owner', 'member', 'collaborator'];

/**
 * Configuración del espacio: quién está y qué ve cada uno.
 *
 * La vista previa por rol existe para contestar "¿qué le voy a mostrar a la
 * encargada?" ANTES de invitarla. Por eso hay un botón por cada rol y no uno
 * por cada persona: si hiciera falta que alguien ya ocupe el rol, no se podría
 * revisar justamente en el momento en que hace falta, que es antes de invitar.
 */
export function SettingsView() {
  const members = useFinanceStore((s) => s.members);
  const loadMembers = useFinanceStore((s) => s.loadMembers);
  const currentWorkspaceId = useFinanceStore((s) => s.currentWorkspaceId);
  const currentRole = useFinanceStore((s) => s.currentRole);
  const previewRole = useFinanceStore((s) => s.previewRole);
  const setPreviewRole = useFinanceStore((s) => s.setPreviewRole);
  const people = useFinanceStore((s) => s.people);

  const [cambiando, setCambiando] = useState<WorkspaceRole | null>(null);

  useEffect(() => {
    if (currentWorkspaceId) void loadMembers(currentWorkspaceId);
  }, [currentWorkspaceId, loadMembers]);

  const previsualizar = async (rol: WorkspaceRole | null) => {
    setCambiando(rol);
    try {
      await setPreviewRole(rol);
    } finally {
      setCambiando(null);
    }
  };

  // Sólo el dueño configura, y sólo él puede previsualizar: alguien con menos
  // permisos no tiene nada que ganar viendo la app con todavía menos.
  const puedeConfigurar = currentRole === 'owner' || previewRole !== null;

  return (
    <PageLayout title="Configuración" description="Quién está en el espacio y qué ve cada uno" icon={Settings}>
      <LogoUploader />

      <Panel
        icon={Users}
        title="Miembros"
        description={`${members.length} ${members.length === 1 ? 'persona' : 'personas'} en este espacio`}
      >
        {members.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Todavía no hay nadie más. Invitá desde el selector de espacios.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <UserAvatar person={m.user_id ? people[m.user_id] : undefined} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">
                    {m.full_name || m.email}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {m.pending ? 'Invitación sin aceptar' : m.email}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-accent px-2 py-1 text-xs font-medium">
                  {ROLE_LABEL[m.role]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        icon={Eye}
        title="Ver la app como…"
        description="Revisá qué muestra cada rol antes de invitar a alguien"
      >
        <div className="space-y-2">
          {ROLES.map((rol) => {
            const activo = previewRole === rol;
            const esElMio = !previewRole && currentRole === rol;
            const cuantos = members.filter((m) => m.role === rol).length;

            return (
              <div
                key={rol}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center',
                  activo ? 'border-primary bg-primary/5' : 'border-border/60'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{ROLE_LABEL[rol]}</p>
                    {esElMio && (
                      <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-medium">
                        tu rol
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {cuantos === 0
                        ? 'nadie todavía'
                        : `${cuantos} ${cuantos === 1 ? 'persona' : 'personas'}`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{ROLE_HINT[rol]}</p>
                </div>

                <Button
                  size="sm"
                  variant={activo ? 'default' : 'outline'}
                  disabled={!puedeConfigurar || cambiando !== null || esElMio}
                  onClick={() => previsualizar(activo ? null : rol)}
                  className="shrink-0 gap-1.5"
                >
                  <Eye className="size-4" />
                  {cambiando === rol
                    ? 'Cambiando…'
                    : activo
                      ? 'Salir de la vista'
                      : esElMio
                        ? 'Es tu rol'
                        : 'Ver como'}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Decir qué es y qué NO es. Una vista previa que se presente como
            prueba de seguridad da una tranquilidad falsa, que es peor que no
            tenerla. */}
        <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-muted/60 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 text-xs text-muted-foreground">
            <p>
              Esto muestra la app <strong className="text-foreground">como la vería</strong> ese
              rol: el menú, las pantallas y los datos que le llegan.
            </p>
            <p className="mt-1 flex items-start gap-1.5">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              Lo que de verdad impide que alguien vea de más no es esta pantalla sino la base:
              cada tabla corta por rol y por espacio, así que aunque consulte por fuera de la app
              no obtiene nada.
            </p>
          </div>
        </div>
      </Panel>
    </PageLayout>
  );
}
