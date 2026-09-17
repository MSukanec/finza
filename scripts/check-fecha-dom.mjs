// El campo de fecha (DateInput), con eventos reales sobre un DOM simulado.
//
// Existe porque el input nativo dejaba la fecha pegada a la etiqueta. Acá la
// fecha la dibuja un texto a la derecha y el input nativo va encima, invisible:
// hay que probar que el texto refleja el valor, que cambiar la fecha llega al
// formulario, y que tocar abre el calendario.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost/' });
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { Field } = await import('../src/components/ui/field.tsx');
const { DateInput } = await import('../src/components/ui/date-input.tsx');

const casos = [];
const registrar = (nombre, ok, detalle = '') => casos.push({ nombre, ok, detalle });

let valorActual;
function App({ inicial, placeholder, type }) {
  const [v, setV] = React.useState(inicial);
  valorActual = v;
  return React.createElement(Field, { label: 'Fecha', htmlFor: 'f' },
    React.createElement(DateInput, { id: 'f', value: v, onChange: setV, placeholder, type }));
}

async function montar(props) {
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.appendChild(host);
  const raiz = createRoot(host);
  await act(async () => raiz.render(React.createElement(App, props)));
  return raiz;
}
const texto = () => document.querySelector('[data-slot=date-input] span').textContent;
const nativo = () => document.querySelector('[data-slot=date-input] input');

{
  const raiz = await montar({ inicial: '2026-09-17' });
  registrar('muestra la fecha como dd/mm/aaaa', texto() === '17/09/2026', texto());
  registrar('la fila la alinea a la derecha', document.querySelector('[data-slot=date-input]').className.includes('justify-end'));
  registrar('la etiqueta apunta al input real', document.querySelector('label').htmlFor === nativo().id);
  registrar('en la fila no hay otro texto que el título y la fecha',
    document.querySelector('[data-slot=date-input]').parentElement.parentElement.textContent === 'Fecha17/09/2026',
    document.querySelector('[data-slot=date-input]').parentElement.parentElement.textContent);

  let abrioCalendario = false;
  nativo().showPicker = () => { abrioCalendario = true; };
  await act(async () => nativo().click());
  registrar('tocar abre el calendario del sistema', abrioCalendario);

  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(nativo(), '2026-10-01');
    nativo().dispatchEvent(new Event('input', { bubbles: true }));
    nativo().dispatchEvent(new Event('change', { bubbles: true }));
  });
  registrar('elegir otra fecha llega al formulario', valorActual === '2026-10-01', valorActual);
  registrar('y se ve la nueva', texto() === '01/10/2026', texto());
  await act(async () => raiz.unmount());
}

{
  const raiz = await montar({ inicial: '', placeholder: 'Contado' });
  registrar('vacía muestra el placeholder', texto() === 'Contado', texto());
  registrar('el placeholder va apagado', document.querySelector('[data-slot=date-input] span').className.includes('text-muted-foreground'));
  await act(async () => raiz.unmount());
}

{
  const raiz = await montar({ inicial: '2026-09', type: 'month' });
  registrar('un mes se muestra como mm/aaaa', texto() === '09/2026', texto());
  await act(async () => raiz.unmount());
}

await GlobalRegistrator.unregister();

let fallas = 0;
for (const c of casos) {
  if (c.ok) console.log(`OK   ${c.nombre}`);
  else { fallas++; console.log(`FALLA ${c.nombre}${c.detalle ? ` — ${c.detalle}` : ''}`); }
}
process.exit(fallas === 0 ? 0 : 1);
