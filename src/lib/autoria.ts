/**
 * Quién puede cambiar un movimiento: sólo quien lo cargó.
 *
 * Decidido con el usuario el 2026-09-17. VER sigue la regla de roles (el
 * administrador y los miembros ven todo, el colaborador lo suyo); CAMBIAR es de
 * quien lo cargó, sea cual sea su rol. Cambiar es editarlo, darlo de baja,
 * marcarlo, adjuntarle o quitarle un comprobante.
 *
 * La barrera real está en la base (DB/045). Esto existe para que la pantalla no
 * ofrezca un botón que la base va a rechazar, y para que el store no pinte un
 * cambio que nunca se va a guardar.
 */
export function puedeCambiar(
  movimiento: { user_id: string | null } | null | undefined,
  yo: string | null | undefined
): boolean {
  // Sin autor conocido no hay a quién reconocerle el control. Mejor negar y que
  // la base confirme, que ofrecer un botón que falla.
  return !!movimiento?.user_id && !!yo && movimiento.user_id === yo;
}

/** Lo que se le dice a quien intenta cambiar algo ajeno. */
export const SOLO_QUIEN_LO_CARGO = 'Sólo quien cargó este movimiento puede cambiarlo.';
