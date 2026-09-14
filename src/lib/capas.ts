/**
 * Las capas de la interfaz, en un solo lugar.
 *
 * Repartidas por los componentes, dos capas terminan con el mismo número y una
 * tapa a la otra. Pasó: la hoja "Más" de mobile quedó en 60 y el desplegable
 * del selector de espacios en 50, así que en el teléfono el menú se abría
 * DEBAJO de la hoja que lo había abierto — o sea, no se podía cambiar de
 * espacio desde el celular.
 *
 * La regla es una sola: lo que se abre DESDE algo tiene que estar por encima de
 * ese algo.
 *
 *   40  encabezados pegados arriba
 *   50  el menú de abajo en mobile
 *   60  lo que tapa la pantalla: modales, cajones, la hoja "Más"
 *   70  lo que sale de un control: desplegables, popovers, tooltips
 *   80  los avisos, que tienen que verse siempre
 *
 * Las clases de Tailwind se escriben literales —no se pueden armar con una
 * variable sin romper el compilador—, así que esto documenta y los componentes
 * lo siguen. `npm run check:capas` verifica que nadie se desvíe.
 */
export const CAPAS = {
  encabezado: 40,
  menuInferior: 50,
  sobrePantalla: 60,
  flotante: 70,
  aviso: 80,
} as const;
