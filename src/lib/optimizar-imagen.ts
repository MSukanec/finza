/** Lado máximo del logo. Se muestra a 36px, así que 256 alcanza para retina. */
const LADO = 256;

/**
 * Achica una imagen a un cuadrado y la devuelve en WebP.
 *
 * Se hace en el navegador y no en el servidor por una razón práctica: la foto
 * que saca alguien del logo con el celular pesa 4 MB, y subir eso para después
 * tirar el 99% desperdicia los datos del que la sube, que muchas veces está en
 * el local con el teléfono.
 *
 * Recorta al centro en vez de deformar: un logo estirado se ve peor que uno
 * recortado.
 */
export async function optimizarLogo(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);

  try {
    const lado = Math.min(bitmap.width, bitmap.height);
    const x = (bitmap.width - lado) / 2;
    const y = (bitmap.height - lado) / 2;

    // No se agranda una imagen chica: sólo agregaría peso sin agregar detalle.
    const destino = Math.min(LADO, lado);

    const canvas = document.createElement('canvas');
    canvas.width = destino;
    canvas.height = destino;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la imagen.');

    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, x, y, lado, lado, 0, 0, destino, destino);

    const blob = await new Promise<Blob | null>((resolve) =>
      // WebP con 0.9: a simple vista igual que el original y pesa una fracción.
      canvas.toBlob(resolve, 'image/webp', 0.9)
    );

    if (!blob) throw new Error('No se pudo convertir la imagen.');
    return blob;
  } finally {
    // Sin esto la imagen decodificada queda en memoria hasta que el navegador
    // decida recolectarla, y son varios MB por intento.
    bitmap.close();
  }
}
