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

let fallas = 0;
for (const c of casos) {
  if (c.ok) console.log(`OK   ${c.nombre}`);
  else {
    fallas++;
    console.log(`FALLA ${c.nombre}${c.detalle ? ` — ${c.detalle}` : ''}`);
  }
}

process.exit(fallas === 0 ? 0 : 1);
