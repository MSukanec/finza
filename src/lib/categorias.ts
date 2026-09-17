import type { Budget, Category, Debt, Transaction } from '@/lib/types';

/**
 * Borrar categorías y macrogrupos con reemplazo, del lado de la pantalla.
 *
 * La operación de verdad la hace la base (`borrar_categoria` y `borrar_grupo`,
 * DB/047). Esto repite LAS MISMAS reglas sobre lo que hay en memoria, para que la
 * pantalla se actualice al instante sin esperar a recargar. Si las dos se
 * separan, después de recargar las cosas aparecen en otro lugar que el que
 * mostró la pantalla. `check-categorias-memoria` prueba estas reglas y
 * `check:categorias` las de la base, con los mismos casos.
 */

/** Lo que devuelve `uso_de_categoria`. */
export interface UsoDeCategoria {
  movimientos: number;
  movimientos_de_baja: number;
  deudas: number;
  presupuestos: number;
  reglas: number;
  total: number;
}

/** Lo que devuelve `uso_de_grupo`. */
export interface UsoDeGrupo {
  categorias_de_egreso: number;
  categorias_de_ingreso: number;
  categorias: number;
  movimientos: number;
  total: number;
}

/** "34 movimientos, 1 deuda y 2 presupuestos". Vacío si no hay nada. */
export function describirUso(uso: UsoDeCategoria): string {
  const partes: string[] = [];
  const vivos = uso.movimientos;
  if (vivos) partes.push(`${vivos} ${vivos === 1 ? 'movimiento' : 'movimientos'}`);
  if (uso.movimientos_de_baja) {
    partes.push(`${uso.movimientos_de_baja} ${uso.movimientos_de_baja === 1 ? 'movimiento dado de baja' : 'movimientos dados de baja'}`);
  }
  if (uso.deudas) partes.push(`${uso.deudas} ${uso.deudas === 1 ? 'deuda' : 'deudas'}`);
  if (uso.presupuestos) partes.push(`${uso.presupuestos} ${uso.presupuestos === 1 ? 'presupuesto' : 'presupuestos'}`);
  if (uso.reglas) partes.push(`${uso.reglas} ${uso.reglas === 1 ? 'regla de importación' : 'reglas de importación'}`);
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/** "3 categorías de egreso y 1 de ingreso". */
export function describirUsoDeGrupo(uso: UsoDeGrupo): string {
  const e = uso.categorias_de_egreso;
  const i = uso.categorias_de_ingreso;
  const cat = (n: number) => (n === 1 ? 'categoría' : 'categorías');
  if (e && i) return `${e} ${cat(e)} de egreso y ${i} de ingreso`;
  if (e) return `${e} ${cat(e)} de egreso`;
  if (i) return `${i} ${cat(i)} de ingreso`;
  return '';
}

/**
 * Pasa todo lo que usa `origen` a `destino`: movimientos, deudas, presupuestos.
 *
 * Un presupuesto que ya tenía las dos queda con una sola línea con la suma de
 * los límites, igual que en la base.
 */
export function migrarCategoria(
  listas: { transactions: Transaction[]; debts: Debt[]; budgets: Budget[] },
  origen: string,
  destino: string
): { transactions: Transaction[]; debts: Debt[]; budgets: Budget[] } {
  return {
    transactions: listas.transactions.map((t) => (t.category_id === origen ? { ...t, category_id: destino } : t)),
    debts: listas.debts.map((d) => (d.category_id === origen ? { ...d, category_id: destino } : d)),
    budgets: listas.budgets.map((b) => {
      const vieja = b.categories.find((l) => l.category_id === origen);
      if (!vieja) return b;
      const yaTiene = b.categories.some((l) => l.category_id === destino);
      return {
        ...b,
        categories: yaTiene
          ? b.categories
              .filter((l) => l.category_id !== origen)
              .map((l) => (l.category_id === destino ? { ...l, limit_amount: l.limit_amount + vieja.limit_amount } : l))
          : b.categories.map((l) => (l.category_id === origen ? { ...l, category_id: destino } : l)),
      };
    }),
  };
}

const mismoNombre = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Qué pasa con cada categoría al borrar un grupo pasándolo a otro.
 *
 * Una categoría que en el destino ya existe —mismo nombre, sin importar
 * mayúsculas, y mismo tipo— se FUSIONA con esa. El resto se mueve.
 */
export function planDeBorrarGrupo(
  categorias: Category[],
  grupo: string,
  reemplazo: string
): { mover: string[]; fusionar: { origen: string; destino: string }[] } {
  const mover: string[] = [];
  const fusionar: { origen: string; destino: string }[] = [];
  for (const c of categorias.filter((x) => x.group_id === grupo)) {
    const gemela = categorias.find(
      (d) => d.group_id === reemplazo && d.type === c.type && mismoNombre(d.name, c.name)
    );
    if (gemela) fusionar.push({ origen: c.id, destino: gemela.id });
    else mover.push(c.id);
  }
  return { mover, fusionar };
}
