import type { Account } from '@/lib/types';

/**
 * Reglas del árbol de billeteras, en un solo lugar.
 *
 * El saldo de una billetera que agrupa YA incluye el de sus subcuentas. Sumar
 * la lista entera cuenta el mismo dinero dos veces, y ese error no se ve: el
 * número queda plausible, sólo que inflado. Pasó en cuatro pantallas a la vez
 * —el balance del inicio, el carrusel, "tenés hoy" en pagos y el filtro— porque
 * cada una recorría `accounts` por su cuenta.
 */

/** Si tiene subcuentas: agrupa y no recibe movimientos. */
export function esAgrupador(cuenta: Account, todas: Account[]): boolean {
  return todas.some((a) => a.parent_id === cuenta.id);
}

/**
 * Las de primer nivel. Para totales y resúmenes: cada peso aparece una vez.
 */
export function raices(cuentas: Account[]): Account[] {
  return cuentas.filter((a) => !a.parent_id);
}

/**
 * Las que reciben movimientos. Para elegir dónde entra o sale la plata: un
 * agrupador no puede, y la base lo rechaza.
 */
export function hojas(cuentas: Account[]): Account[] {
  const agrupan = new Set(cuentas.map((a) => a.parent_id).filter(Boolean) as string[]);
  return cuentas.filter((a) => !agrupan.has(a.id));
}

/** Suma sin contar dos veces. `convertir` lleva cada saldo a la moneda base. */
export function saldoTotal(
  cuentas: Account[],
  convertir: (monto: number, moneda: string) => number = (m) => m
): number {
  return raices(cuentas).reduce((s, a) => s + convertir(a.balance, a.currency_id), 0);
}
