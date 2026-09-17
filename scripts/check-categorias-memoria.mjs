// Borrar y reemplazar categorías en memoria (src/lib/categorias.ts).
//
// Los mismos casos que check:categorias prueba contra la base. Si la pantalla y
// la base aplican reglas distintas, después de recargar las cosas aparecen en
// otro lugar que el que se mostró.
const { migrarCategoria, planDeBorrarGrupo, describirUso, describirUsoDeGrupo } =
  await import('../src/lib/categorias.ts');

const casos = [];
const registrar = (nombre, ok, detalle = '') => casos.push({ nombre, ok, detalle });

// ---------------------------------------------------------------- migrar
{
  const listas = {
    transactions: [
      { id: 't1', category_id: 'pesca' },
      { id: 't2', category_id: 'pesca' },
      { id: 't3', category_id: 'bebidas' },
    ],
    debts: [{ id: 'd1', category_id: 'pesca' }],
    budgets: [
      { id: 'b1', categories: [{ category_id: 'pesca', limit_amount: 100 }, { category_id: 'carne', limit_amount: 50 }] },
      { id: 'b2', categories: [{ category_id: 'pesca', limit_amount: 70 }] },
      { id: 'b3', categories: [{ category_id: 'bebidas', limit_amount: 10 }] },
    ],
  };
  const r = migrarCategoria(listas, 'pesca', 'carne');

  registrar('los movimientos pasan', r.transactions.filter((t) => t.category_id === 'carne').length === 2);
  registrar('los de otra categoría no se tocan', r.transactions.find((t) => t.id === 't3').category_id === 'bebidas');
  registrar('la deuda pasa', r.debts[0].category_id === 'carne');

  const b1 = r.budgets.find((b) => b.id === 'b1');
  registrar('un presupuesto con las dos queda con una sola línea', b1.categories.length === 1, JSON.stringify(b1.categories));
  registrar('con la suma de los límites, como en la base', b1.categories[0].limit_amount === 150);
  const b2 = r.budgets.find((b) => b.id === 'b2');
  registrar('un presupuesto con sólo la vieja la cambia por la nueva',
    b2.categories.length === 1 && b2.categories[0].category_id === 'carne' && b2.categories[0].limit_amount === 70);
  registrar('un presupuesto sin la vieja queda igual', r.budgets.find((b) => b.id === 'b3') === listas.budgets[2]);
  registrar('no modifica las listas originales', listas.transactions[0].category_id === 'pesca');
}

// ---------------------------------------------------------------- borrar grupo
{
  const categorias = [
    { id: 'pesca', name: 'Pescadería', type: 'expense', group_id: 'prov' },
    { id: 'general', name: 'General', type: 'expense', group_id: 'prov' },
    { id: 'ventas', name: 'General', type: 'income', group_id: 'prov' },
    { id: 'generalIns', name: ' general ', type: 'expense', group_id: 'ins' },
    { id: 'otra', name: 'Pescadería', type: 'expense', group_id: 'otro' },
  ];
  const plan = planDeBorrarGrupo(categorias, 'prov', 'ins');

  registrar('fusiona la que ya existe en el destino, sin importar mayúsculas ni espacios',
    plan.fusionar.length === 1 && plan.fusionar[0].origen === 'general' && plan.fusionar[0].destino === 'generalIns',
    JSON.stringify(plan));
  registrar('una homónima de OTRO tipo no se fusiona: se mueve', plan.mover.includes('ventas'));
  registrar('mueve las que no existen en el destino', plan.mover.includes('pesca'));
  registrar('una homónima en un tercer grupo no cuenta', !plan.fusionar.some((f) => f.destino === 'otra'));
  registrar('no toca categorías de otros grupos', !plan.mover.includes('otra') && !plan.mover.includes('generalIns'));
}

// ---------------------------------------------------------------- textos
{
  const base = { movimientos: 0, movimientos_de_baja: 0, deudas: 0, presupuestos: 0, reglas: 0, total: 0 };
  registrar('sin uso no dice nada', describirUso(base) === '');
  registrar('un solo uso, en singular', describirUso({ ...base, movimientos: 1, total: 1 }) === '1 movimiento');
  registrar('varios, con coma e "y"',
    describirUso({ ...base, movimientos: 34, deudas: 1, presupuestos: 2, total: 37 }) === '34 movimientos, 1 deuda y 2 presupuestos',
    describirUso({ ...base, movimientos: 34, deudas: 1, presupuestos: 2 }));
  registrar('nombra los dados de baja',
    describirUso({ ...base, movimientos_de_baja: 3, total: 3 }) === '3 movimientos dados de baja');
  registrar('el grupo dice cuántas de cada tipo',
    describirUsoDeGrupo({ categorias_de_egreso: 3, categorias_de_ingreso: 1, categorias: 4, movimientos: 0, total: 4 }) ===
      '3 categorías de egreso y 1 de ingreso');
}

let fallas = 0;
for (const c of casos) {
  if (c.ok) console.log(`OK   ${c.nombre}`);
  else {
    fallas++;
    console.log(`FALLA ${c.nombre}${c.detalle ? ` — ${c.detalle}` : ''}`);
  }
}
process.exit(fallas === 0 ? 0 : 1);
