'use client';

import { useRef, useState } from 'react';
import { useFinanceStore } from '@/stores/finance-store';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { WorkspaceLogo } from '@/components/workspace-logo';
import { useGlobalDialog } from '@/components/providers/dialog-provider';
import { ImageIcon, Upload, Trash2 } from 'lucide-react';

/** Lo que acepta el bucket. Declararlo acá evita el viaje de ida y vuelta. */
// Sin SVG: createImageBitmap no lo maneja de forma confiable en todos los
// navegadores y el camino quedaría roto en algunos sin avisar.
const TIPOS = ['image/png', 'image/jpeg', 'image/webp'];
const TOPE = 8 * 1024 * 1024;

export function LogoUploader() {
  const workspaces = useFinanceStore((s) => s.workspaces);
  const currentWorkspaceId = useFinanceStore((s) => s.currentWorkspaceId);
  const subir = useFinanceStore((s) => s.uploadWorkspaceLogo);
  const removeWorkspaceLogo = useFinanceStore((s) => s.removeWorkspaceLogo);
  const dialog = useGlobalDialog();

  const input = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const espacio = workspaces.find((w) => w.id === currentWorkspaceId) ?? null;
  const esDueno = espacio?.role === 'owner';

  const tomar = async (archivo: File | undefined) => {
    if (!archivo || !currentWorkspaceId) return;
    setError(null);

    // Se avisa acá y no después de subir: el que está en el local con el
    // teléfono no tiene por qué gastar datos para enterarse de que no servía.
    if (!TIPOS.includes(archivo.type)) {
      return setError('Tiene que ser una imagen PNG, JPG o WebP.');
    }
    if (archivo.size > TOPE) {
      return setError('La imagen es muy pesada. Probá con una más chica.');
    }

    setTrabajando(true);
    try {
      await subir(currentWorkspaceId, archivo);
    } catch (e: any) {
      setError(e?.message || 'No se pudo subir el logo.');
    } finally {
      setTrabajando(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Panel
      icon={ImageIcon}
      title="Logo"
      description="Reemplaza el ícono de arriba a la izquierda"
    >
      <div className="flex items-center gap-4">
        <WorkspaceLogo workspace={espacio} size="lg" />

        <div className="min-w-0 flex-1">
          <p className="text-sm">
            {espacio?.logo_url ? 'Logo cargado' : 'Sin logo'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {esDueno
              ? 'Se recorta al centro y se achica a 256px antes de subirla.'
              : 'Sólo el dueño del espacio puede cambiarlo.'}
          </p>
        </div>

        {esDueno && (
          <div className="flex shrink-0 gap-2">
            {espacio?.logo_url && (
              <Button
                variant="ghost"
                size="sm"
                disabled={trabajando}
                onClick={async () => {
                  const ok = await dialog.confirm(
                    'Quitar el logo',
                    'El espacio vuelve a mostrar el ícono por defecto. Para volver a tenerlo hay que subirlo de nuevo.',
                    { confirmar: 'Quitar' }
                  );
                  if (!ok) return;
                  setTrabajando(true);
                  try {
                    await removeWorkspaceLogo(currentWorkspaceId!);
                  } catch (e: any) {
                    setError(e?.message || 'No se pudo quitar.');
                  } finally {
                    setTrabajando(false);
                  }
                }}
                aria-label="Quitar el logo"
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={trabajando}
              onClick={() => input.current?.click()}
            >
              <Upload className="size-4" />
              {trabajando ? 'Subiendo…' : espacio?.logo_url ? 'Cambiar' : 'Subir'}
            </Button>
          </div>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept={TIPOS.join(',')}
        className="hidden"
        onChange={(e) => tomar(e.target.files?.[0])}
      />

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </Panel>
  );
}
