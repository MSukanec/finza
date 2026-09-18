/**
 * En qué espacio arranca la app.
 *
 * Pedido del usuario: donde estabas la última vez, aunque hayas cerrado la app,
 * cerrado sesión o entrado desde otro dispositivo (DB/049).
 *
 * En orden:
 *   1. El de esta sesión. Recién cambiaste de espacio y la app se recarga: es
 *      ése, sin discusión.
 *   2. El guardado en la cuenta. Es la última elección, hecha en cualquier
 *      dispositivo, y sobrevive a cerrar sesión.
 *   3. El guardado en este navegador. Sirve mientras la cuenta todavía no tiene
 *      el dato (personas que entraron antes de que existiera).
 *   4. El primero de la lista.
 *
 * Cualquiera de los tres guardados puede apuntar a un espacio del que ya no sos
 * miembro —te sacaron, se borró, o el navegador lo compartía otra persona—: ése
 * se saltea y se prueba el siguiente.
 */
export function elegirEspacio(
  espacios: { id: string }[],
  guardados: {
    enSesion?: string | null;
    enCuenta?: string | null;
    enNavegador?: string | null;
  }
): string | null {
  const validos = new Set(espacios.map((e) => e.id));
  for (const id of [guardados.enSesion, guardados.enCuenta, guardados.enNavegador]) {
    if (id && validos.has(id)) return id;
  }
  return espacios[0]?.id ?? null;
}
