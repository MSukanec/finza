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

/** Lo que devuelve `uso_de_billetera` (DB/048). */
export interface UsoDeBilletera {
  movimientos: number;
  movimientos_de_baja: number;
  arqueos: number;
  reglas: number;
  subcuentas: number;
  saldo_inicial: number | string;
  total: number;
}

/**
 * "345 movimientos, 3 arqueos y un saldo inicial". Vacío si no hay nada.
 *
 * El saldo inicial se nombra porque también se migra: si no se dijera, borrar
 * una billetera con saldo inicial y sin movimientos parecería no costar nada.
 */
export function describirUsoDeBilletera(uso: UsoDeBilletera): string {
  const partes: string[] = [];
  const plural = (n: number, singular: string, muchos: string) => `${n} ${n === 1 ? singular : muchos}`;
  if (uso.movimientos) partes.push(plural(uso.movimientos, 'movimiento', 'movimientos'));
  if (uso.movimientos_de_baja) {
    partes.push(plural(uso.movimientos_de_baja, 'movimiento dado de baja', 'movimientos dados de baja'));
  }
  if (uso.arqueos) partes.push(plural(uso.arqueos, 'arqueo', 'arqueos'));
  if (uso.reglas) partes.push(plural(uso.reglas, 'regla de importación', 'reglas de importación'));
  if (uso.subcuentas) partes.push(plural(uso.subcuentas, 'subcuenta', 'subcuentas'));
  if (Number(uso.saldo_inicial) !== 0) partes.push('un saldo inicial');
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}
