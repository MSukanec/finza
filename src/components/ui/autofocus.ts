import { useMediaQuery } from '@/hooks/use-media-query';

/**
 * Si conviene enfocar un campo solo al abrir un formulario.
 *
 * Con teclado físico sí: se abre y ya se puede tipear. En un teléfono no, y el
 * motivo no es el ancho de la pantalla sino que el teclado es de software:
 * enfocar un campo lo hace aparecer, tapa media pantalla y arrastra el scroll
 * hasta el campo enfocado. Abrir "Nuevo movimiento" y encontrarse con un
 * teclado numérico —sin haber tocado nada— es exactamente eso.
 *
 * Por eso la pregunta es por el PUNTERO y no por el ancho. `(pointer: fine)`
 * es un mouse o un trackpad; `(hover: hover)` es que ese puntero puede posarse
 * sin hacer clic. Las dos juntas describen una computadora. Una ventana de
 * Chrome angosta sigue siendo una computadora y conserva el foco; un iPad en
 * horizontal mide más de 768px y NO lo conserva, que es lo correcto.
 *
 * En el teléfono la persona toca el campo que quiere y ahí aparece el teclado,
 * que es cuando lo pidió.
 */
export function useAutoFoco(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)');
}
