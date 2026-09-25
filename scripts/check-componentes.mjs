// Revisión de los componentes compartidos: defectos que se pueden verificar,
// no impresiones. Cada caso nació de algo que ya estuvo mal en pantalla.
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon';

const { Picker } = await import('../src/components/ui/picker.tsx');
const { Field } = await import('../src/components/ui/field.tsx');
const { SimpleAccordion } = await import('../src/components/ui/simple-accordion.tsx');
const { Input } = await import('../src/components/ui/input.tsx');

const casos = [];
const registrar = (nombre, ok, detalle = '') => casos.push({ nombre, ok, detalle });

// ---------------------------------------------------------------- Picker
{
  const html = renderToStaticMarkup(
    React.createElement(Picker, {
      value: 'ars',
      onValueChange: () => {},
      options: [
        { value: 'ars', label: 'Peso Argentino', hint: 'ARS' },
        { value: 'usd', label: 'Dólar Estadounidense', hint: 'USD' },
      ],
    })
  );
  registrar('Picker muestra la etiqueta y no el valor', html.includes('Peso Argentino'));
  registrar('Picker no filtra con listas cortas', !html.includes('Buscar'));

  // El bug de la captura: Combobox.Empty siempre dibuja su <div>, así que un
  // padding sin `empty:hidden` quedaba como una banda blanca fija.
  const { default: fs } = await import('node:fs');
  const fuente = fs.readFileSync('src/components/ui/picker.tsx', 'utf8');
  const empty = fuente.match(/<Combobox\.Empty className="([^"]*)"/);
  registrar(
    'El bloque de "sin resultados" se colapsa cuando hay opciones',
    !!empty && empty[1].includes('empty:hidden'),
    empty ? empty[1] : 'no se encontró Combobox.Empty'
  );
}

// ---------------------------------------------------------------- Field
{
  const html = renderToStaticMarkup(
    React.createElement(
      Field,
      // `hint` a propósito: el campo ya no lo acepta y no lo tiene que dibujar.
      { label: 'Monto', hint: 'ARS', htmlFor: 'x' },
      React.createElement(Input, { id: 'x', defaultValue: '100' })
    )
  );
  registrar('Field asocia la etiqueta con el control', html.includes('for="x"'));
  // Pedido del usuario: a la izquierda sólo el título, a la derecha sólo el
  // dato o su placeholder. "cuándo pasó", "contado", "opcional", la moneda:
  // afuera.
  registrar('Field no dibuja textos al costado del dato', !html.includes('ARS'));
  registrar('Field marca el foco en el contenedor', html.includes('focus-within:'));
}

// ------------------------------------------------------- SimpleAccordion
{
  const abierto = renderToStaticMarkup(
    React.createElement(
      SimpleAccordion,
      { title: 'Cuentas', summary: '$100', defaultOpen: true },
      React.createElement('p', null, 'contenido')
    )
  );
  const cerrado = renderToStaticMarkup(
    React.createElement(
      SimpleAccordion,
      { title: 'Cuentas', summary: '$100' },
      React.createElement('p', null, 'contenido')
    )
  );

  registrar('El encabezado es un <button> real', abierto.includes('<button'));
  registrar('Anuncia si está abierto', abierto.includes('aria-expanded="true"'));
  registrar('Anuncia si está cerrado', cerrado.includes('aria-expanded="false"'));
  registrar('Apunta al panel que controla', abierto.includes('aria-controls='));
  registrar('Tiene estilo de foco visible', abierto.includes('focus-visible:'));
  registrar('Cerrado no renderiza el contenido', !cerrado.includes('contenido'));
}

// ------------------------------------------- Contrato del footer del modal
{
  // El footer aplica h-14/flex-1 a sus HIJOS DIRECTOS: la regla es que el
  // footer entero sea el botón. Un <div> con varios botones adentro convierte
  // a ese div en "el botón" y todo queda apretado en una pastilla.
  const { default: fs } = await import('node:fs');
  const dirs = fs.readdirSync('src/features', { withFileTypes: true }).filter((d) => d.isDirectory());
  const malos = [];

  for (const d of dirs) {
    const base = `src/features/${d.name}/components`;
    if (!fs.existsSync(base)) continue;
    for (const archivo of fs.readdirSync(base)) {
      if (!archivo.endsWith('.tsx')) continue;
      const ruta = `${base}/${archivo}`;
      const src = fs.readFileSync(ruta, 'utf8');
      const i = src.indexOf('<ResponsiveModalFooter>');
      if (i < 0) continue;
      const bloque = src.slice(i, src.indexOf('</ResponsiveModalFooter>', i));
      if (bloque.includes('<div')) malos.push(archivo);
    }
  }

  registrar(
    'Ningún modal mete un <div> dentro del footer',
    malos.length === 0,
    malos.join(', ')
  );
}

// ------------------------------------------- Reglas de mobile
//
// Tres defectos reales de teléfono, cada uno con su rastro en el archivo.
{
  const { default: fs } = await import('node:fs');
  const campo = fs.readFileSync('src/components/ui/field.tsx', 'utf8');
  const picker = fs.readFileSync('src/components/ui/picker.tsx', 'utf8');
  const cajon = fs.readFileSync('src/components/ui/drawer.tsx', 'utf8');

  // 1. Safari en iPhone hace zoom sobre cualquier input de menos de 16px al
  //    enfocarlo, y el zoom deja el formulario a medio salir de la pantalla.
  //    Todo tamaño chico tiene que ir detrás de `md:`.
  const chicosSueltos = [...campo.matchAll(/(?<!md:)text-\[1[0-5]px\]/g)];
  registrar(
    'Ningún control del campo baja de 16px en el teléfono',
    chicosSueltos.length === 0,
    chicosSueltos.map((m) => m[0]).join(', ')
  );

  // 2. La lista tiene que medir lo mismo que el campo que la abrió. Son DOS
  //    cosas y las dos hicieron falta: el ancho (`max(anchor, 12rem)` hacía
  //    que un campo angosto abriera una lista más ancha y uno ancho una más
  //    finita) y el ancla (un desplegable se mide contra su disparador, y
  //    adentro de un campo el disparador es sólo el tramo a la derecha de la
  //    etiqueta, así que la lista salía corrida y más corta que el campo).
  registrar(
    'La lista del desplegable mide lo mismo que el campo',
    picker.includes('w-(--anchor-width)') && !picker.includes('max(var(--anchor-width)')
  );
  registrar(
    'El desplegable se ancla a la fila del campo, no a su disparador',
    picker.includes('useAnclaDelCampo') && /anchor=\{ancla/.test(picker)
  );
  registrar(
    'El campo ofrece su fila como ancla',
    campo.includes('AnclaDelCampo.Provider') && campo.includes('export { Field, useAnclaDelCampo }')
  );

  // 2.b La descripción vacía tiene que apoyarse a la derecha como todo lo
  //     demás; el placeholder pegado a la etiqueta quedaba flotando al medio.
  registrar(
    'El placeholder de la descripción va contra el borde derecho',
    campo.includes('[&_[data-slot=textarea]:placeholder-shown]:text-right')
  );

  // 2.c El foco automático se decide por el PUNTERO, no por el ancho: lo que
  //     molesta en el teléfono es el teclado de software, y un iPad en
  //     horizontal mide más de 768px.
  const foco = fs.readFileSync('src/components/ui/autofocus.ts', 'utf8');
  registrar(
    'El foco automático pregunta por el puntero, no por el ancho',
    foco.includes('(hover: hover) and (pointer: fine)') && !foco.includes('min-width')
  );

  // 2.d Ningún `autoFocus` suelto: todos pasan por el hook.
  const sueltos = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = `${dir}/${e.name}`;
      if (e.isDirectory()) recorrer(ruta);
      else if (e.name.endsWith('.tsx') && /autoFocus(?!=\{)/.test(fs.readFileSync(ruta, 'utf8'))) {
        sueltos.push(ruta);
      }
    }
  };
  recorrer('src');
  registrar(
    'Ningún autoFocus escrito a mano: todos pasan por useAutoFoco',
    sueltos.length === 0,
    sueltos.join(', ')
  );

  // 3. 44px es el mínimo cómodo al dedo; con 36 se toca la opción de al lado.
  registrar(
    'Las opciones del desplegable llegan a 44px de alto',
    /Combobox\.Item[\s\S]{0,400}min-h-11/.test(picker)
  );

  // 4. El cajón tenía `mt-24` (96px fijos) más `max-h-[92dvh]`: entre las dos
  //    se pasaba de la pantalla y el botón de guardar quedaba fuera de vista.
  registrar(
    'El cajón de mobile no empuja con mt-24',
    !cajon.includes('direction=bottom]:mt-24')
  );

  // 5. `vh` se queda con la medida de cuando cargó la página; en el teléfono
  //    la barra del navegador aparece y desaparece. Tiene que ser `dvh`.
  registrar(
    'El alto del cajón se mide en dvh, no en vh',
    /direction=bottom\]:max-h-\[\d+dvh\]/.test(cajon)
  );
}

// ------------------------------------------- Cada uno cambia lo suyo (DB/045)
//
// Ver no es cambiar. Lo ajeno se abre para mirarlo y descargar sus
// comprobantes; editarlo, borrarlo, marcarlo o adjuntarle es de quien lo cargó.
{
  const { default: fs } = await import('node:fs');
  const formulario = fs.readFileSync('src/features/transactions/components/transaction-form.tsx', 'utf8');
  const lista = fs.readFileSync('src/features/transactions/components/transaction-list.tsx', 'utf8');
  const adjuntos = fs.readFileSync('src/features/transactions/components/attachments-field.tsx', 'utf8');
  const store = fs.readFileSync('src/stores/finance-store.ts', 'utf8');

  registrar(
    'El formulario bloquea los campos de un movimiento ajeno',
    /<fieldset\s+disabled=\{soloLectura\}/.test(formulario)
  );

  // Si los comprobantes quedaran adentro del fieldset, sus botones de abrir y
  // descargar también se desactivarían: justo lo que sí tiene que poder hacer.
  const cierre = formulario.indexOf('</fieldset>');
  const comprobantes = formulario.indexOf('<AttachmentsField transactionId');
  registrar(
    'Los comprobantes quedan fuera del bloqueo, para poder descargarlos',
    cierre > 0 && comprobantes > cierre
  );
  registrar(
    'En un movimiento ajeno no se ofrece guardar',
    /soloLectura \? \(\s*<Button[^>]*onClick=\{closeSheet\}/.test(formulario)
  );
  registrar(
    'La lista sólo muestra acciones en lo propio',
    /puedeCambiar\(tx, appUserId\) && \(\s*<div className="hidden shrink-0/.test(lista)
  );
  registrar(
    'Sin permiso no se ofrece adjuntar ni quitar',
    adjuntos.includes('{soloLectura ? (') && adjuntos.includes('{!soloLectura && (')
  );

  // Un UPDATE que la RLS filtra no da error: sale "bien" con cero filas y la
  // pantalla muestra un cambio que nunca se guardó. Toda escritura sobre
  // movimientos o adjuntos tiene que pedir las filas de vuelta y exigirlas.
  const sinVerificar = [];
  const patron = /from\('(transactions|transaction_attachments)'\)\s*\.update\(/g;
  for (const m of store.matchAll(patron)) {
    const tramo = store.slice(m.index, store.indexOf(';', m.index));
    if (!tramo.includes(".select('id')")) {
      sinVerificar.push(store.slice(0, m.index).split('\n').length);
    }
  }
  registrar(
    'Toda escritura sobre movimientos verifica que la base cambió algo',
    sinVerificar.length === 0,
    `líneas de finance-store.ts: ${sinVerificar.join(', ')}`
  );

  // Borrar con reemplazo toca movimientos de todos, deudas, presupuestos y
  // reglas: va por las funciones de la base (DB/047), que lo hacen en una sola
  // transacción. Un UPDATE directo movería sólo los movimientos propios.
  // Borrar una billetera se lleva movimientos, arqueos y el saldo inicial: va
  // por la función (DB/048), que lo hace todo en una transacción y suma el
  // saldo inicial al de la que reemplaza.
  registrar(
    'Borrar billeteras usa la función de la base',
    (() => {
      const desde = store.indexOf('  accountUsage: async');
      const hasta = store.indexOf('  // === CATEGORIES ===');
      const tramo = store.slice(desde, hasta);
      return desde > 0 && hasta > desde && tramo.includes("rpc('borrar_billetera'") &&
        !/from\('wallets'\)\s*\.update\(\{\s*deleted_at/.test(tramo);
    })()
  );
  registrar(
    'La pantalla de billeteras ofrece borrar, con reemplazo',
    (() => {
      const vista = fs.readFileSync('src/features/accounts/views/accounts-view.tsx', 'utf8');
      return vista.includes('BorrarConReemplazo') && vista.includes('removeAccount(');
    })()
  );

  registrar(
    'Borrar categorías y grupos usa las funciones de la base, no UPDATEs',
    (() => {
      // Sólo el tramo de categorías del store: borrar una deuda también da de
      // baja la categoría que la deuda creó, y ése es otro flujo.
      const desde = store.indexOf('  categoryUsage: async');
      const hasta = store.indexOf('  // === BUDGETS ===');
      const tramo = store.slice(desde, hasta);
      return (
        desde > 0 && hasta > desde &&
        tramo.includes("rpc('borrar_categoria'") &&
        tramo.includes("rpc('borrar_grupo'") &&
        !/from\('(transactions|categories|debts|budget_categories|import_rules)'\)\s*\.update\(/.test(tramo)
      );
    })()
  );
}

// ------------------------------------------- Toda acción destructiva confirma antes
//
// Regla del usuario: nada se borra, se quita ni se deshace con un solo toque.
// Recorre las pantallas y, por cada llamada a una acción destructiva, exige una
// confirmación en las líneas previas: `dialog.confirm(...)`, o que viva dentro
// de `onConfirmar` de BorrarConReemplazo (que ya pregunta y muestra el uso).
{
  const { default: fs } = await import('node:fs');
  const DESTRUCTIVAS = [
    'removeTransaction', 'removeBudget', 'removeDebt', 'removePartner', 'removeMember',
    'deleteWorkspace', 'leaveWorkspace', 'removeAttachment', 'revertImportBatch',
    'removeCategory', 'removeCategoryGroup', 'removeAccount', 'removeWorkspaceLogo',
  ];
  const patron = new RegExp(`\\b(${DESTRUCTIVAS.join('|')})\\(`, 'g');
  const sinConfirmar = [];

  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!ruta.includes('/stores')) recorrer(ruta); continue; }
      if (!e.name.endsWith('.tsx')) continue;
      const src = fs.readFileSync(ruta, 'utf8');
      for (const m of src.matchAll(patron)) {
        // La declaración del hook (`useFinanceStore((s) => s.removeX)`) no es una llamada.
        const linea = src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index));
        if (/useFinanceStore\(/.test(linea)) continue;
        const antes = src.slice(Math.max(0, m.index - 700), m.index);
        if (!/dialog\.confirm\(|onConfirmar=/.test(antes)) {
          sinConfirmar.push(`${ruta.replace('src/', '')}:${src.slice(0, m.index).split('\n').length} ${m[1]}`);
        }
      }
    }
  };
  recorrer('src');

  registrar(
    'Toda acción destructiva de la app pide confirmación antes',
    sinConfirmar.length === 0,
    sinConfirmar.join(' | ')
  );
}

// ------------------------------------------- Orden del formulario de movimiento
//
// Decidido con el usuario: Fecha, Tipo, Billetera, Se paga, Monto, y recién
// después la clasificación. "Se paga" depende de la billetera (DB/046): arriba
// de ella, cambiar de billetera hacía aparecer un campo por encima de donde se
// estaba tocando.
{
  const { default: fs } = await import('node:fs');
  const f = fs.readFileSync('src/features/transactions/components/transaction-form.tsx', 'utf8');
  const posiciones = [
    ['Fecha', f.indexOf('<Field label="Fecha"')],
    ['Tipo', f.indexOf('<Field label="Tipo"')],
    ['Billetera', f.indexOf("<Field label={isTransfer ? 'Desde' : 'Billetera'}")],
    ['Se paga', f.indexOf('label="Se paga"')],
    ['Monto', f.indexOf('label="Monto"')],
    ['Macrogrupo', f.indexOf('<Field label="Macrogrupo"')],
    ['Categoría', f.indexOf('<Field label="Categoría"')],
  ];
  const faltan = posiciones.filter(([, i]) => i < 0).map(([n]) => n);
  const enOrden = faltan.length === 0 && posiciones.every(([, i], k) => k === 0 || posiciones[k - 1][1] < i);
  registrar(
    'Formulario de movimiento: Fecha, Tipo, Billetera, Se paga, Monto, Macrogrupo, Categoría',
    enOrden,
    faltan.length ? `faltan: ${faltan.join(', ')}` : [...posiciones].sort((a, b) => a[1] - b[1]).map(([n]) => n).join(' → ')
  );
}

// ------------------------------------------- Fechas dentro de un campo
//
// El <input type="date"> nativo ignora la alineación y dejaba la fecha pegada a
// la etiqueta. Dentro de un formulario se usa DateInput, que la dibuja a la
// derecha como cualquier otro dato.
{
  const { default: fs } = await import('node:fs');
  const nativas = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = `${dir}/${e.name}`;
      if (e.isDirectory()) recorrer(ruta);
      else if (e.name.endsWith('-form.tsx') || e.name === 'attachments-field.tsx') {
        const src = fs.readFileSync(ruta, 'utf8');
        // Un <Input> o <input> con type de fecha; `<DateInput type="month">` es el bueno.
        if (/<[Ii]nput\s[^>]*type="(date|month)"/.test(src)) nativas.push(ruta.replace('src/', ''));
      }
    }
  };
  recorrer('src/features');
  registrar('Ningún formulario usa la fecha nativa: usan DateInput', nativas.length === 0, nativas.join(', '));
}

// ------------------------------------------- Nada vive sólo detrás del mouse
//
// En el teléfono no existe "pasar por encima": una acción que sólo aparece con
// `group-hover` es una acción que no se puede tocar. Pasó con borrar y salir de
// un espacio, y con editar y borrar categorías.
//
// Vale esconderla en pantalla grande (`md:opacity-0 md:group-hover:opacity-100`)
// o directamente no mostrarla en mobile (`hidden ... md:flex`) SI hay otro
// camino: la fila de movimientos se toca y abre el formulario, que tiene su
// propio botón de eliminar.
{
  const { default: fs } = await import('node:fs');
  const escondidas = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = `${dir}/${e.name}`;
      if (e.isDirectory()) { recorrer(ruta); continue; }
      if (!e.name.endsWith('.tsx')) continue;
      const src = fs.readFileSync(ruta, 'utf8');
      for (const m of src.matchAll(/className=[{"'`]([^"'`]*opacity-0[^"'`]*group-hover[^"'`]*opacity-100[^"'`]*)/g)) {
        const clases = m[1];
        if (clases.includes('md:opacity-0') || clases.includes('hidden')) continue;
        escondidas.push(`${ruta.replace('src/', '')}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
  };
  recorrer('src');
  registrar(
    'Ninguna acción se esconde detrás del mouse en el teléfono',
    escondidas.length === 0,
    escondidas.join(', ')
  );

  // Y la salida que justifica esconderlas en la lista de movimientos: el
  // formulario tiene su propio botón de eliminar.
  const formulario = fs.readFileSync('src/features/transactions/components/transaction-form.tsx', 'utf8');
  registrar(
    'Un movimiento se puede eliminar desde su formulario (único camino en el teléfono)',
    formulario.includes('Eliminar movimiento') && formulario.includes('removeTransaction(')
  );
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
