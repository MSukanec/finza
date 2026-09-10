// Prueba que <SelectValue /> muestre la ETIQUETA y no el valor crudo.
//
// El bug que verifica: los filtros mostraban "all" y el selector de moneda
// mostraba "ars", porque Select.Value sin hijos imprime el valor.
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../src/components/ui/select.tsx';
import { Select as SelectPrimitive } from '@base-ui/react/select';

const casos = [
  {
    nombre: 'filtro con "Cualquiera" por defecto',
    valor: 'all',
    items: [
      ['all', 'Cualquiera'],
      ['w1', 'Banco Santander Río'],
    ],
    esperado: 'Cualquiera',
    prohibido: 'all',
  },
  {
    nombre: 'moneda',
    valor: 'ars',
    items: [
      ['ars', 'Peso argentino'],
      ['usd', 'Dólar'],
    ],
    esperado: 'Peso argentino',
    prohibido: 'ars',
  },
  {
    nombre: 'valor no trivial elegido',
    valor: 'w1',
    items: [
      ['all', 'Cualquiera'],
      ['w1', 'Banco Santander Río'],
    ],
    esperado: 'Banco Santander Río',
    prohibido: 'w1',
  },
];

let fallas = 0;

for (const c of casos) {
  const html = renderToStaticMarkup(
    React.createElement(
      Select,
      { value: c.valor },
      React.createElement(SelectTrigger, null, React.createElement(SelectValue)),
      React.createElement(
        SelectContent,
        null,
        c.items.map(([v, label]) => React.createElement(SelectItem, { key: v, value: v }, label))
      )
    )
  );

  const texto = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const ok = texto.includes(c.esperado);
  const filtrado = !new RegExp(`(^|\\s)${c.prohibido}(\\s|$)`).test(texto);

  if (ok && filtrado) {
    console.log(`OK   ${c.nombre} -> "${texto}"`);
  } else {
    fallas++;
    console.log(`FALLA ${c.nombre}`);
    console.log(`      esperaba "${c.esperado}", salio "${texto}"`);
  }
}

// Control: con el primitivo crudo (sin el mapa de etiquetas) tiene que salir
// "all". Si esto NO pasa, el test de arriba no esta probando nada.
const htmlCrudo = renderToStaticMarkup(
  React.createElement(
    SelectPrimitive.Root,
    { value: 'all' },
    React.createElement(SelectTrigger, null, React.createElement(SelectValue)),
    React.createElement(
      SelectContent,
      null,
      React.createElement(SelectItem, { value: 'all' }, 'Cualquiera')
    )
  )
);
const textoCrudo = htmlCrudo.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
if (/(^|\s)all(\s|$)/.test(textoCrudo)) {
  console.log(`OK   control: sin el fix sale el valor crudo -> "${textoCrudo}"`);
} else {
  fallas++;
  console.log(`FALLA control: esperaba ver "all" crudo, salio "${textoCrudo}"`);
  console.log('      => el test no detecta el bug, no sirve como prueba');
}

process.exit(fallas === 0 ? 0 : 1);
