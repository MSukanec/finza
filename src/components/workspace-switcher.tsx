'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFinanceStore } from '@/stores/finance-store';
import { WorkspaceLogo } from '@/components/workspace-logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAutoFoco } from '@/components/ui/autofocus';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Plus, Copy, FilePlus2, Trash2, Users, LogOut } from 'lucide-react';
import { useGlobalDialog } from '@/components/providers/dialog-provider';

export function WorkspaceSwitcher({ onCambiar }: { onCambiar?: () => void } = {}) {
  const workspaces = useFinanceStore((s) => s.workspaces);
  const currentWorkspaceId = useFinanceStore((s) => s.currentWorkspaceId);
  const switchWorkspace = useFinanceStore((s) => s.switchWorkspace);
  const createWorkspace = useFinanceStore((s) => s.createWorkspace);
  const deleteWorkspace = useFinanceStore((s) => s.deleteWorkspace);
  const leaveWorkspace = useFinanceStore((s) => s.leaveWorkspace);
  const dialog = useGlobalDialog();
  const router = useRouter();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const autoFoco = useAutoFoco();
  const [mode, setMode] = useState<'empty' | 'clone'>('empty');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = workspaces.find((w) => w.id === currentWorkspaceId);

  if (!current && workspaces.length === 0) return null;

  const handleLeave = async (id: string, wsName: string) => {
    const ok = await dialog.confirm('Salir del espacio', `¿Salir de "${wsName}"? Vas a perder el acceso a sus datos hasta que te vuelvan a invitar.`);
    if (!ok) return;
    try {
      await leaveWorkspace(id);
    } catch (e: any) {
      dialog.notify('No se pudo salir', e?.message || 'Ocurrió un error.');
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await createWorkspace(name.trim(), { clone: mode === 'clone' });
      setCreateOpen(false);
      setName('');
      setMode('empty');
    } catch (e: any) {
      setError(e.message || 'No se pudo crear el espacio.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, wsName: string) => {
    const ok = await dialog.confirm('Eliminar espacio', `¿Eliminar "${wsName}"? Se borran TODOS sus datos: billeteras, movimientos y categorías. No se puede deshacer.`);
    if (!ok) return;
    try {
      await deleteWorkspace(id);
    } catch (e: any) {
      dialog.notify('No se pudo eliminar', e?.message || 'Ocurrió un error.');
    }
  };

  return (
    <>
      <DropdownMenu>
        {/* La marca Y el selector son el mismo control. Antes eran dos filas
            —el logo arriba, el espacio abajo— que juntas se comían 130px del
            alto del sidebar sin decir nada que no entre en una. */}
        <DropdownMenuTrigger className="w-full outline-none">
          <div className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent">
            <WorkspaceLogo workspace={current} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-none tracking-tight">Finza</p>
              <p className="mt-1 truncate text-xs leading-none text-muted-foreground">
                {current?.name ?? 'Principal'}
              </p>
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Tus espacios
          </div>
          {workspaces.map((w) => {
            const isCurrent = w.id === currentWorkspaceId;
            return (
              <DropdownMenuItem
                key={w.id}
                onClick={() => {
                  if (isCurrent) return;
                  void switchWorkspace(w.id);
                  // En mobile este selector vive dentro de la hoja "Más": si no
                  // se cierra, cambiar de espacio deja al usuario mirando el
                  // menú en vez de la app que acaba de cambiar.
                  onCambiar?.();
                }}
                className="group/ws gap-2 cursor-pointer"
              >
                <span className="flex size-4 items-center justify-center shrink-0">
                  {isCurrent && <Check className="size-4 text-primary" />}
                </span>
                <span className="flex-1 truncate">{w.name}</span>
                {w.role !== 'owner' && (
                  <Users className="size-3.5 text-muted-foreground shrink-0" aria-label="Espacio compartido" />
                )}
                {workspaces.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (w.role === 'owner') handleDelete(w.id, w.name);
                      else handleLeave(w.id, w.name);
                    }}
                    // En el teléfono no hay "pasar el mouse": escondido tras
                    // un hover, este botón no existía. Ahora se ve siempre en
                    // mobile y aparece al pasar en pantalla grande. Y mide 36px:
                    // 20 no es un blanco que se pueda tocar.
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive md:size-7 md:opacity-0 md:group-hover/ws:opacity-100 md:group-focus-within/ws:opacity-100"
                    aria-label={w.role === 'owner' ? `Eliminar el espacio ${w.name}` : `Salir del espacio ${w.name}`}
                    title={w.role === 'owner' ? 'Eliminar espacio' : 'Salir del espacio'}
                  >
                    {w.role === 'owner' ? <Trash2 className="size-4 md:size-3.5" /> : <LogOut className="size-4 md:size-3.5" />}
                  </button>
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          {/* Los miembros se administran en Configuración, que es donde está
              todo lo del espacio. Acá queda el atajo. */}
          {current && (
            <DropdownMenuItem onClick={() => router.push('/configuracion')} className="gap-2 cursor-pointer">
              <Users className="size-4" />
              Miembros de «{current.name}»
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              setName('');
              setMode('empty');
              setError(null);
              setCreateOpen(true);
            }}
            className="gap-2 cursor-pointer text-primary focus:text-primary"
          >
            <Plus className="size-4" />
            Crear nuevo espacio
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo espacio</DialogTitle>
            <DialogDescription>
              Un espacio separado con sus propias cuentas, movimientos y categorías. Ideal para hacer pruebas sin tocar tus datos reales.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="ws-name" className="text-xs text-muted-foreground">Nombre</Label>
              <Input
                id="ws-name"
                placeholder="Ej: Pruebas"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus={autoFoco}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('empty')}
                className={cn(
                  'flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-colors',
                  mode === 'empty' ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50'
                )}
              >
                <FilePlus2 className={cn('size-5', mode === 'empty' ? 'text-primary' : 'text-muted-foreground')} />
                <span className="text-sm font-medium">Vacío</span>
                <span className="text-[11px] text-muted-foreground leading-tight">Empezar de cero</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('clone')}
                className={cn(
                  'flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-colors',
                  mode === 'clone' ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50'
                )}
              >
                <Copy className={cn('size-5', mode === 'clone' ? 'text-primary' : 'text-muted-foreground')} />
                <span className="text-sm font-medium">Duplicar actual</span>
                <span className="text-[11px] text-muted-foreground leading-tight truncate w-full">Copia de «{current?.name ?? 'Principal'}»</span>
              </button>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button onClick={handleCreate} disabled={!name.trim() || loading} className="w-full" size="lg">
              {loading ? 'Creando…' : 'Crear espacio'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
