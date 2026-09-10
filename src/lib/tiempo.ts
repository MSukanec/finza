/**
 * "recién", "hace 3 h", "hace 2 días", o la fecha si ya pasó un mes.
 *
 * Para una última conexión, el número exacto no dice nada: lo que importa es si
 * la persona entró hoy o hace dos meses. Pasado el mes sí conviene la fecha,
 * porque "hace 47 días" obliga a hacer la cuenta.
 */
export function haceCuanto(iso: string | null | undefined): string {
  if (!iso) return 'nunca entró';

  const min = Math.floor((Date.now() - +new Date(iso)) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;

  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;

  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;

  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Si pasó menos de un día. Sirve para marcar lo reciente. */
export const esDeHoy = (iso: string | null | undefined) =>
  !!iso && Date.now() - +new Date(iso) < 24 * 3600 * 1000;
