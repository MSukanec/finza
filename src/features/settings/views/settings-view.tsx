'use client';

import { useEffect, useState } from 'react';
import { useFinanceStore } from '@/stores/finance-store';
import { PageLayout } from '@/components/layout/page-layout';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { cn } from '@/lib/utils';
import { haceCuanto, esDeHoy } from '@/lib/tiempo';
import { ROLE_LABEL, ROLE_HINT, type WorkspaceRole } from '@/lib/types';
import { Settings, Users, Eye, ShieldCheck, Info, Trash2, UserPlus } from 'lucide-react';
import { LogoUploader } from '../components/logo-uploader';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Picker } from '@/components/ui/picker';
import { useGlobalDialog } from '@/components/providers/dialog-provider';
import { toast } from '@/stores/toast-store';
import type { WorkspaceMember } from '@/lib/types';

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
  const appUserId = useFinanceStore((s) => s.appUserId);
  const inviteMember = useFinanceStore((s) => s.inviteMember);
  const changeMemberRole = useFinanceStore((s) => s.changeMemberRole);
  const removeMember = useFinanceStore((s) => s.removeMember);
  const dialog = useGlobalDialog();

  const [cambiando, setCambiando] = useState<WorkspaceRole | null>(null);
  const [email, setEmail] = useState('');
  const [rolNuevo, setRolNuevo] = useState<WorkspaceRole>('member');
  const [invitando, setInvitando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

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
  // Mientras se mira la app como otro rol, no se administra: sería administrar
  // con permisos que no se están simulando.
  const esDuenio = currentRole === 'owner' && previewRole === null;

  const invitar = async () => {
    const valor = email.trim();
    if (!valor || !currentWorkspaceId) return;
    setInvitando(true);
    setError(null);
    setAviso(null);
    try {
      const resultado = await inviteMember(currentWorkspaceId, valor, rolNuevo);
      setEmail('');
      setAviso(
        resultado === 'added'
          ? `Listo: ${valor} ya entró al espacio como ${ROLE_LABEL[rolNuevo].toLowerCase()}.`
          : `${valor} todavía no tiene cuenta. Queda invitado como ${ROLE_LABEL[rolNuevo].toLowerCase()} y entra solo cuando se registre con ese email.`
      );
    } catch (e) {
      setError((e as Error).message || 'No se pudo invitar.');
    } finally {
      setInvitando(false);
    }
  };

  const cambiarRol = async (m: WorkspaceMember, rol: WorkspaceRole) => {
    if (rol === m.role || !currentWorkspaceId) return;
    setError(null);
    setAviso(null);
    try {
      await changeMemberRole(currentWorkspaceId, m, rol);
      setAviso(`${m.full_name || m.email} ahora es ${ROLE_LABEL[rol].toLowerCase()}.`);
    } catch (e) {
      setError((e as Error).message || 'No se pudo cambiar el rol.');
    }
  };

  const quitar = async (m: WorkspaceMember) => {
    if (!currentWorkspaceId) return;
    const ok = await dialog.confirm(
      m.pending ? 'Cancelar invitación' : 'Quitar del espacio',
      m.pending
        ? `Se cancela la invitación a ${m.email}. Si se registra, no va a entrar a este espacio.`
        : `${m.full_name || m.email} pierde el acceso a este espacio. Lo que cargó queda; se le puede volver a invitar cuando quieras.`,
      { confirmar: m.pending ? 'Cancelar invitación' : 'Quitar' }
    );
    if (!ok) return;
    setError(null);
    setAviso(null);
    try {
      await removeMember(currentWorkspaceId, m);
      toast.success(m.pending ? 'Invitación cancelada.' : `${m.full_name || m.email} ya no está en el espacio.`);
    } catch (e) {
      setError((e as Error).message || 'No se pudo quitar.');
    }
  };

  return (
    <PageLayout title="Configuración" description="Quién está en el espacio y qué ve cada uno" icon={Settings}>
      <LogoUploader />

      <Panel
        icon={Users}
        title="Miembros"
        description={`${members.length} ${members.length === 1 ? 'persona' : 'personas'} en este espacio`}
      >
        {/* Invitar y quitar viven acá, con la lista: es el único lugar donde se
            administra el espacio. Antes estaban escondidos en el selector de
            espacios, que es para cambiar de espacio, no para administrarlo. */}
        {esDuenio && (
          <div className="mb-4 space-y-2 rounded-xl border border-border/60 p-3">
            <Field label="Invitar por email" htmlFor="invitar-email">
              <Input
                id="invitar-email"
                type="email"
                autoComplete="off"
                placeholder="socio@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void invitar()}
              />
            </Field>
            <Field label="Entra como">
              <Picker
                value={rolNuevo}
                onValueChange={(v) => setRolNuevo(v as WorkspaceRole)}
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                searchable={false}
              />
            </Field>
            <Button className="w-full gap-2" disabled={invitando || !email.trim()} onClick={() => void invitar()}>
              <UserPlus className="size-4" />
              {invitando ? 'Invitando…' : 'Invitar'}
            </Button>
            <p className="px-1 text-xs text-muted-foreground">{ROLE_HINT[rolNuevo]}</p>
          </div>
        )}

        {aviso && <p className="mb-3 rounded-xl bg-income/10 p-3 text-sm text-income">{aviso}</p>}
        {error && (
          <p role="alert" className="mb-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {members.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {esDuenio ? 'Todavía no hay nadie más. Invitá a alguien acá arriba.' : 'Todavía no hay nadie más.'}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {members.map((m) => {
              const soyYo = !!m.user_id && m.user_id === appUserId;
              return (
                // En el teléfono la fila se parte en dos: arriba quién es,
                // abajo el rol, la última conexión y quitar. En una sola fila,
                // el nombre quedaba en cuatro letras y un "…".
                <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <UserAvatar person={m.user_id ? people[m.user_id] : undefined} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-tight">
                        {m.full_name || m.email}
                        {soyYo && <span className="font-normal text-muted-foreground"> (vos)</span>}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {m.pending ? 'Invitación sin aceptar' : m.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-13 sm:pl-0">

                  {/* El dueño cambia el rol acá mismo. Nadie cambia el suyo:
                      quedarse sin dueño dejaría el espacio sin quien lo
                      administre. */}
                  {esDuenio && !soyYo ? (
                    <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
                      <Picker
                        value={m.role}
                        onValueChange={(v) => void cambiarRol(m, v as WorkspaceRole)}
                        options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                        searchable={false}
                      />
                    </div>
                  ) : (
                    <span className="shrink-0 rounded-md bg-accent px-2 py-1 text-xs font-medium">
                      {ROLE_LABEL[m.role]}
                    </span>
                  )}

                  {/* La última conexión dice quién está mirando las cuentas y
                      quién no. Entre socios eso es información de trabajo. */}
                  <span
                    className={cn(
                      'shrink-0 text-right text-[11px] sm:w-20',
                      esDeHoy(m.last_sign_in) ? 'text-income' : 'text-muted-foreground'
                    )}
                  >
                    {m.pending ? 'sin aceptar' : haceCuanto(m.last_sign_in)}
                  </span>

                  {esDuenio && !soyYo && (
                    <button
                      type="button"
                      onClick={() => void quitar(m)}
                      aria-label={m.pending ? `Cancelar la invitación a ${m.email}` : `Quitar a ${m.email}`}
                      title={m.pending ? 'Cancelar invitación' : 'Quitar del espacio'}
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!esDuenio && currentRole !== 'owner' && (
          <p className="mt-3 px-1 text-xs text-muted-foreground">
            Sólo el dueño del espacio puede invitar o quitar miembros.
          </p>
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
