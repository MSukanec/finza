import { useMediaQuery } from '@/hooks/use-media-query';

/**
 * Si conviene enfocar un campo solo al abrir un formulario.
 *
 * En una pantalla grande sí: se abre y ya se puede tipear. En un teléfono no:
 * levanta el teclado antes de que la persona haya visto el formulario, y como
 * el teclado ocupa media pantalla, lo único que queda a la vista es el campo
 * enfocado. Abrir "Nuevo movimiento" y encontrarse con un teclado numérico y
 * nada más es exactamente eso.
 *
 * En el teléfono la persona toca el campo que quiere y ahí aparece el teclado,
 * que es cuando lo pidió.
 */
export function useAutoFoco(): boolean {
  return useMediaQuery('(min-width: 768px)');
}
