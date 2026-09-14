import * as React from 'react';

/**
 * Si la pantalla cumple una media query, leído DURANTE el render.
 *
 * Antes arrancaba en `false` y corregía en un efecto. Eso hacía que en una
 * pantalla grande el modal se montara un frame como cajón de mobile y recién
 * después saltara a diálogo: se veía el salto y el contenido se remontaba,
 * perdiendo el foco de lo que estuvieras escribiendo.
 *
 * `useSyncExternalStore` lee el valor real en el primer render, sin efecto y
 * sin salto. En el servidor no hay `matchMedia`, así que devuelve `false` —la
 * versión de mobile, que es la más angosta— y React reconcilia al hidratar.
 */
export function useMediaQuery(query: string): boolean {
  const suscribir = React.useCallback(
    (avisar: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', avisar);
      return () => mql.removeEventListener('change', avisar);
    },
    [query]
  );

  return React.useSyncExternalStore(
    suscribir,
    () => window.matchMedia(query).matches,
    () => false
  );
}
