'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalBody,
  ResponsiveModalFooter,
} from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Picker, type PickerOption } from '@/components/ui/picker';

/**
 * Borrar algo que puede estar en uso.
 *
 * El flujo, pedido por el usuario:
 *   1. Se abre y pregunta a la base si está en uso. La pantalla no lo sabe:
 *      no tiene los movimientos dados de baja, ni las reglas de importación.
 *   2. Si no está en uso, dice eso y se borra con un toque.
 *   3. Si está en uso, dice en qué, y pide con qué reemplazarlo. Recién con un
 *      reemplazo elegido se puede confirmar, y al confirmar se migra todo.
 *
 * Es genérico a propósito: categorías y macrogrupos lo usan igual, y lo que
 * venga después (billeteras, socios) no tiene que inventar otro.
 */
export function BorrarConReemplazo({
  abierto,
  onCerrar,
  titulo,
  nombre,
  cargarUso,
  opciones,
  etiquetaReemplazo = 'Reemplazar por',
  explicacionReemplazo,
  sinOpciones,
  onConfirmar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** "Eliminar categoría". */
  titulo: string;
  /** Lo que se borra, tal como lo ve la persona: "Pescadería". */
  nombre: string;
  /** Pregunta a la base. `descripcion` es "34 movimientos y 1 deuda". */
  cargarUso: () => Promise<{ total: number; descripcion: string }>;
  /** Con qué se puede reemplazar. Ya filtrado: mismo tipo, mismo espacio. */
  opciones: PickerOption[];
  etiquetaReemplazo?: string;
  /** Qué pasa al reemplazar: "Todo pasa a la categoría que elijas." */
  explicacionReemplazo?: string;
  /** Qué hacer si está en uso y no hay con qué reemplazarlo. */
  sinOpciones?: string;
  /** `null` si no estaba en uso. La operación la hace quien llama. */
  onConfirmar: (reemplazoId: string | null) => void;
}) {
  const [estado, setEstado] = useState<
    | { paso: 'revisando' }
    | { paso: 'libre' }
    | { paso: 'en-uso'; descripcion: string }
    | { paso: 'error'; mensaje: string }
  >({ paso: 'revisando' });
  const [reemplazo, setReemplazo] = useState<string>('');

  // Cada vez que se abre se vuelve a preguntar: lo que estaba en uso hace un
  // rato puede no estarlo ahora, y al revés.
  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setEstado({ paso: 'revisando' });
    setReemplazo('');
    cargarUso()
      .then((uso) => {
        if (!vigente) return;
        setEstado(uso.total > 0 ? { paso: 'en-uso', descripcion: uso.descripcion } : { paso: 'libre' });
      })
      .catch((e: Error) => vigente && setEstado({ paso: 'error', mensaje: e?.message || 'No se pudo revisar si está en uso.' }));
    return () => {
      vigente = false;
    };
    // `cargarUso` cambia en cada render de quien lo pasa; lo que importa es
    // que se abrió, y qué se abrió.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, nombre]);

  const confirmar = () => {
    if (estado.paso === 'libre') onConfirmar(null);
    else if (estado.paso === 'en-uso' && reemplazo) onConfirmar(reemplazo);
    else return;
    onCerrar();
  };

  const puedeConfirmar = estado.paso === 'libre' || (estado.paso === 'en-uso' && !!reemplazo);

  return (
    <ResponsiveModal open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{titulo}</ResponsiveModalTitle>
        </ResponsiveModalHeader>

        <ResponsiveModalBody className="space-y-3">
          {estado.paso === 'revisando' && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Revisando si &ldquo;{nombre}&rdquo; está en uso…
            </p>
          )}

          {estado.paso === 'libre' && (
            <p className="flex items-start gap-2 text-sm" data-estado="libre">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-income" />
              <span>
                &ldquo;{nombre}&rdquo; no está en uso. Se puede eliminar sin afectar nada.
              </span>
            </p>
          )}

          {estado.paso === 'en-uso' && (
            <>
              <p className="flex items-start gap-2 text-sm" data-estado="en-uso">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  &ldquo;{nombre}&rdquo; está en uso en <strong className="font-semibold">{estado.descripcion}</strong>.
                  {opciones.length > 0 && (
                    <> Para eliminarlo, elegí con qué reemplazarlo. {explicacionReemplazo}</>
                  )}
                </span>
              </p>
              {opciones.length > 0 ? (
                <Field label={etiquetaReemplazo}>
                  <Picker value={reemplazo} onValueChange={setReemplazo} options={opciones} placeholder="Elegir" />
                </Field>
              ) : (
                <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                  {sinOpciones ?? 'No hay con qué reemplazarlo. Creá otro primero.'}
                </p>
              )}
            </>
          )}

          {estado.paso === 'error' && (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {estado.mensaje}
            </p>
          )}
        </ResponsiveModalBody>

        <ResponsiveModalFooter>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={!puedeConfirmar} onClick={confirmar}>
            {estado.paso === 'en-uso' ? 'Reemplazar y eliminar' : 'Eliminar'}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
