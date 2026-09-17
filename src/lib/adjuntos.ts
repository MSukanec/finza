/**
 * Reglas de los comprobantes que se cuelgan de un movimiento.
 *
 * El bucket ya limita tamaño y tipo (DB/044), y esa es la barrera real. Esto
 * repite los mismos límites del lado del cliente sólo para avisar ANTES de
 * subir, con un mensaje que se entienda: lo que devuelve storage cuando rechaza
 * un archivo es "mime type not supported", y eso no le dice nada a nadie.
 *
 * Si se cambia un límite, se cambia en los dos lados.
 */

/** 25 MB, igual que `file_size_limit` del bucket. */
export const TAMANIO_MAXIMO = 25 * 1024 * 1024;

/**
 * Tipo por extensión, para cuando el navegador no lo sabe. Pasa con un .xml o
 * un .csv en Windows, y con cualquier archivo que venga de algunos celulares:
 * `File.type` llega vacío y storage lo rechazaría por no tener tipo.
 */
const TIPO_POR_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  txt: 'text/plain',
  csv: 'text/csv',
  xml: 'text/xml',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip',
};

/** Los mismos tipos que acepta el bucket. `image/*` cubre cualquier foto. */
const TIPOS_PERMITIDOS = new Set(Object.values(TIPO_POR_EXTENSION));

/** Para el `accept` del selector de archivos. Incluye la cámara en el teléfono. */
export const ACEPTA = ['image/*', ...Object.keys(TIPO_POR_EXTENSION).map((e) => `.${e}`)].join(',');

function extension(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto < 0 ? '' : nombre.slice(punto + 1).toLowerCase();
}

/** El tipo real del archivo, o null si no se puede saber. */
export function tipoDeAdjunto(archivo: { name: string; type: string }): string | null {
  if (archivo.type) return archivo.type;
  return TIPO_POR_EXTENSION[extension(archivo.name)] ?? null;
}

/** Por qué no se puede subir, o null si se puede. */
export function validarAdjunto(archivo: { name: string; type: string; size: number }): string | null {
  if (archivo.size > TAMANIO_MAXIMO) {
    return `"${archivo.name}" pesa ${pesoLegible(archivo.size)}. El máximo es 25 MB.`;
  }
  if (archivo.size === 0) {
    return `"${archivo.name}" está vacío.`;
  }
  const tipo = tipoDeAdjunto(archivo);
  if (!tipo || !(tipo.startsWith('image/') || TIPOS_PERMITIDOS.has(tipo))) {
    return `"${archivo.name}" no es un tipo de archivo que se pueda adjuntar. Sirven fotos, PDF, planillas y documentos.`;
  }
  return null;
}

/**
 * Dónde se guarda: `<espacio>/<movimiento>/<adjunto>-<nombre>`.
 *
 * Las dos primeras carpetas NO son decorativas: las políticas del bucket leen
 * el espacio y el movimiento de la ruta, y la base rechaza cualquier otra forma.
 *
 * El nombre se limpia porque storage no acepta cualquier carácter en una clave
 * —"Factura Nº 1083 (copia).pdf" falla— y se le antepone el id para que dos
 * fotos llamadas "IMG_0001.jpg" no se pisen. El nombre original, con acentos y
 * todo, se guarda aparte y es el que se muestra y el que tiene la descarga.
 */
export function rutaDeAdjunto(espacio: string, movimiento: string, id: string, nombre: string): string {
  const limpio =
    nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|-+$/g, '')
      .slice(-80) || 'archivo';
  return `${espacio}/${movimiento}/${id}-${limpio}`;
}

/** "340 KB", "2,4 MB". */
export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`;
}

export function esImagen(mime: string | null): boolean {
  return !!mime && mime.startsWith('image/');
}
