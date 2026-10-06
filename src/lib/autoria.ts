import type { WorkspaceRole } from '@/lib/types';

/**
 * Quién puede cambiar un movimiento.
 *
 * Decidido con el usuario el 2026-10-06 (DB/050), dando vuelta la regla
 * anterior: **si lo ves, lo podés corregir**. El administrador y los miembros
 * ven todo el espacio, así que pueden corregir todo; el colaborador ve sólo lo
 * que cargó él, así que sigue encerrado en lo suyo sin que haya que prohibirle
 * nada aparte.
 *
 * Antes (DB/045) cambiar era sólo de quien lo cargó. En un negocio con socios
 * eso no funciona: si alguien carga un gasto con la categoría equivocada,
 * cualquiera tiene que poder corregirlo sin pedirle que entre. Lo que hace que
 * eso no sea un descontrol no es prohibirlo, es que quede registrado: cada
 * cambio va a Actividad con quién lo hizo y de quién era.
 *
 * La barrera real está en la base. Esto existe para que la pantalla no ofrezca
 * un botón que la base va a rechazar, y para que el store no pinte un cambio
 * que nunca se va a guardar.
 */
export function puedeCambiar(
  movimiento: { user_id: string | null } | null | undefined,
  yo: string | null | undefined,
  rol: WorkspaceRole | null | undefined
): boolean {
  if (!movimiento) return false;
  // Mismo par de condiciones que la política de la base, en el mismo orden.
  if (rol === 'owner' || rol === 'member') return true;
  return !!movimiento.user_id && !!yo && movimiento.user_id === yo;
}

/** Lo que se le dice a quien intenta cambiar algo que no le corresponde. */
export const SOLO_QUIEN_LO_CARGO = 'Sólo quien cargó este movimiento puede cambiarlo.';
