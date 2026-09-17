'use client';

import { useMemo, useRef } from 'react';
import { Download, FileText, ImageIcon, Loader2, Paperclip, X } from 'lucide-react';
import { useFinanceStore } from '@/stores/finance-store';
import { toast } from '@/stores/toast-store';
import { Field } from '@/components/ui/field';
import { ACEPTA, esImagen, pesoLegible, tipoDeAdjunto, validarAdjunto } from '@/lib/adjuntos';
import type { TransactionAttachment } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Los comprobantes de un movimiento, dentro de su formulario.
 *
 * Tiene dos modos porque un movimiento nuevo todavía no existe:
 *
 * - **Editando** (`transactionId`): elegir un archivo lo sube en el acto y
 *   quitarlo lo quita en el acto, igual que cualquier escritura de la app. No
 *   espera a "Guardar cambios" — un adjunto no es un campo del movimiento, y
 *   atarlo al botón haría que cerrar el modal sin querer tirara una foto que ya
 *   se había sacado.
 *
 * - **Nuevo** (`pendientes`): los archivos se juntan acá y se suben cuando el
 *   movimiento se guarda. Ver `attachFiles`, que espera a que la fila exista.
 */
export function AttachmentsField({
  transactionId,
  pendientes = [],
  onPendientesChange = () => {},
  soloLectura = false,
}: {
  /**
   * Movimiento de otra persona: se ven y se descargan sus comprobantes, pero
   * no se adjunta ni se quita nada. Ver DB/045.
   */
  soloLectura?: boolean;
  /** Movimiento ya guardado: lo que se elige se sube en el acto. */
  transactionId?: string | null;
  /** Movimiento nuevo: lo elegido espera acá hasta guardar. */
  pendientes?: File[];
  onPendientesChange?: (archivos: File[]) => void;
}) {
  const props = { transactionId, pendientes, onPendientesChange };
  const entrada = useRef<HTMLInputElement>(null);
  const todos = useFinanceStore((s) => s.attachments);
  const attachFiles = useFinanceStore((s) => s.attachFiles);

  const guardados = useMemo(
    () => (props.transactionId ? todos.filter((a) => a.transaction_id === props.transactionId) : []),
    [todos, props.transactionId]
  );

  const elegir = (lista: FileList | null) => {
    const archivos = Array.from(lista ?? []);
    // Se vacía YA: si no, volver a elegir el mismo archivo después de quitarlo
    // no dispara `change` y parece que el botón no anda.
    if (entrada.current) entrada.current.value = '';
    if (!archivos.length) return;

    if (props.transactionId) {
      void attachFiles(props.transactionId, archivos);
      return;
    }

    // Movimiento nuevo: se avisa ahora lo que no se va a poder subir, en vez de
    // descubrirlo después de guardar, con el modal ya cerrado.
    const validos = archivos.filter((a) => {
      const problema = validarAdjunto(a);
      if (problema) toast.error(problema);
      return !problema;
    });
    props.onPendientesChange([...props.pendientes, ...validos]);
  };

  const cantidad = props.transactionId ? guardados.length : props.pendientes.length;

  return (
    <div className="space-y-1.5">
      <Field label="Comprobantes" hint={cantidad > 0 && !soloLectura ? String(cantidad) : undefined}>
        {soloLectura ? (
          <p className="text-right text-base text-muted-foreground md:text-[15px]">
            {cantidad === 0 ? 'Ninguno' : cantidad === 1 ? '1 archivo' : `${cantidad} archivos`}
          </p>
        ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            className="-mr-1 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-base font-medium text-primary transition-colors hover:bg-accent md:text-[15px]"
          >
            <Paperclip className="size-4" />
            Adjuntar
          </button>
        </div>
        )}
        <input
          ref={entrada}
          type="file"
          multiple
          accept={ACEPTA}
          className="hidden"
          onChange={(e) => elegir(e.target.files)}
        />
      </Field>

      {props.transactionId
        ? guardados.map((a) => <Guardado key={a.id} adjunto={a} soloLectura={soloLectura} />)
        : props.pendientes.map((archivo, i) => (
            <Pendiente
              key={`${archivo.name}-${archivo.size}-${i}`}
              archivo={archivo}
              onQuitar={() => props.onPendientesChange(props.pendientes.filter((_, j) => j !== i))}
            />
          ))}
    </div>
  );
}

// ---------------------------------------------------------------- filas

function Fila({
  mime,
  nombre,
  detalle,
  onAbrir,
  children,
  atenuada,
}: {
  mime: string | null;
  nombre: string;
  detalle: React.ReactNode;
  onAbrir?: () => void;
  children: React.ReactNode;
  atenuada?: boolean;
}) {
  const Icono = esImagen(mime) ? ImageIcon : FileText;
  return (
    <div
      className={cn(
        'flex min-h-12 items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 py-1.5 pr-1 pl-3',
        atenuada && 'opacity-70'
      )}
    >
      <Icono className="size-4 shrink-0 text-muted-foreground" />
      <button
        type="button"
        onClick={onAbrir}
        disabled={!onAbrir}
        className="flex min-w-0 flex-1 flex-col items-start text-left disabled:cursor-default"
      >
        <span className="w-full truncate text-sm">{nombre}</span>
        <span className="text-xs text-muted-foreground">{detalle}</span>
      </button>
      {children}
    </div>
  );
}

function BotonIcono({
  etiqueta,
  onClick,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={onClick}
      // 40px: es un blanco al dedo al lado de otro.
      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Guardado({ adjunto, soloLectura }: { adjunto: TransactionAttachment; soloLectura: boolean }) {
  const attachmentUrl = useFinanceStore((s) => s.attachmentUrl);
  const removeAttachment = useFinanceStore((s) => s.removeAttachment);

  const abrir = async (descargar: boolean) => {
    // Safari en iPhone bloquea `window.open` si no pasa DENTRO del toque, y la
    // URL firmada llega después de un await. Así que la pestaña se abre en el
    // toque, vacía, y recibe su destino cuando la URL vuelve.
    const pestania = descargar ? null : window.open('', '_blank');
    try {
      const url = await attachmentUrl(adjunto, { descargar });
      if (pestania) pestania.location.href = url;
      // Con `descargar`, storage responde "attachment": el navegador guarda el
      // archivo y la app no se va de la página.
      else window.location.assign(url);
    } catch (e) {
      console.error(e);
      pestania?.close();
      toast.error(`No se pudo abrir "${adjunto.file_name}".`);
    }
  };

  return (
    <Fila
      mime={adjunto.mime_type}
      nombre={adjunto.file_name}
      atenuada={adjunto.subiendo}
      onAbrir={adjunto.subiendo ? undefined : () => void abrir(false)}
      detalle={
        adjunto.subiendo ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" /> Subiendo…
          </span>
        ) : (
          pesoLegible(adjunto.size_bytes)
        )
      }
    >
      {!adjunto.subiendo && (
        <>
          <BotonIcono etiqueta="Descargar" onClick={() => void abrir(true)}>
            <Download className="size-4" />
          </BotonIcono>
          {!soloLectura && (
            <BotonIcono etiqueta="Quitar" onClick={() => void removeAttachment(adjunto.id)}>
              <X className="size-4" />
            </BotonIcono>
          )}
        </>
      )}
    </Fila>
  );
}

function Pendiente({ archivo, onQuitar }: { archivo: File; onQuitar: () => void }) {
  // Todavía no está en ningún lado más que en el navegador: se abre desde ahí.
  const ver = () => {
    const url = URL.createObjectURL(archivo);
    window.open(url, '_blank');
    // Se libera más tarde y no en el acto: la pestaña nueva todavía lo está
    // cargando.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <Fila
      mime={tipoDeAdjunto(archivo)}
      nombre={archivo.name}
      onAbrir={ver}
      detalle={`${pesoLegible(archivo.size)} · se sube al guardar`}
    >
      <BotonIcono etiqueta="Quitar" onClick={onQuitar}>
        <X className="size-4" />
      </BotonIcono>
    </Fila>
  );
}
