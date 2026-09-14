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
      { label: 'Monto', hint: 'ARS', htmlFor: 'x' },
      React.createElement(Input, { id: 'x', defaultValue: '100' })
    )
  );
  registrar('Field asocia la etiqueta con el control', html.includes('for="x"'));
  registrar('Field muestra el hint', html.includes('ARS'));
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

let fallas = 0;
for (const c of casos) {
  if (c.ok) console.log(`OK   ${c.nombre}`);
  else {
    fallas++;
    console.log(`FALLA ${c.nombre}${c.detalle ? ` — ${c.detalle}` : ''}`);
  }
}

process.exit(fallas === 0 ? 0 : 1);
