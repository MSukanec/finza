// El desplegable, con clics de verdad sobre un DOM simulado.
//
// Existe por un bug que ninguna prueba estática vio: Base UI copiaba el nombre
// de la opción elegida a su texto de búsqueda interno, y la próxima vez que se
// abría la lista venía filtrada por eso. En "Nuevo movimiento", elegir Aporte y
// volver a abrir Tipo dejaba una sola opción: "Egreso". Renderizar a HTML no lo
// muestra — hace falta abrir, elegir y volver a abrir.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost/' });
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { Picker } = await import('../src/components/ui/picker.tsx');

const casos = [];
const registrar = (nombre, ok, detalle = '') => casos.push({ nombre, ok, detalle });

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const opciones = () => [...document.querySelectorAll('[role=option]')];
const textos = () => opciones().map((o) => o.textContent).join(' | ');

let raiz = null;
async function montar(props) {
  // Desmontar ANTES de limpiar: el desplegable vive en un portal colgado del
  // body, y borrarlo por debajo de React hace fallar el desmontaje.
  if (raiz) await act(async () => raiz.unmount());
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.appendChild(host);
  let fijar;
  function App() {
    const [v, setV] = React.useState(props.value);
    fijar = setV;
    return React.createElement(Picker, { ...props, value: v, onValueChange: setV });
  }
  raiz = createRoot(host);
  await act(async () => raiz.render(React.createElement(App)));
  return { trigger: () => host.querySelector('[data-slot=picker-trigger]'), fijar: () => fijar };
}

async function tocar(el) {
  await act(async () => {
    for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      el.dispatchEvent(new MouseEvent(tipo, { bubbles: true }));
    }
    el.click();
  });
  await act(async () => espera(250));
}

async function elegir(texto) {
  const el = opciones().find((o) => o.textContent.includes(texto));
  if (!el) return false;
  await tocar(el);
  return true;
}

async function tipear(texto) {
  const input = document.querySelector('[data-slot=picker-popup] input');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, texto);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: texto }));
  });
  await act(async () => espera(100));
}

// ---------------------------------------------------------------- sin buscador (Tipo)
{
  const TIPOS = [
    { value: 'income', label: 'Ingreso' },
    { value: 'expense', label: 'Egreso' },
    { value: 'transfer', label: 'Transferencia' },
    { value: 'contribution', label: 'Aporte', hint: 'de un socio' },
    { value: 'withdrawal', label: 'Retiro', hint: 'de un socio' },
  ];
  const { trigger } = await montar({ value: 'expense', options: TIPOS, searchable: false });

  await tocar(trigger());
  registrar('al abrir están las cinco opciones', opciones().length === 5, textos());

  registrar('se puede elegir Aporte', await elegir('Aporte'));
  registrar('el campo muestra Aporte', trigger().textContent.includes('Aporte'), trigger().textContent);

  await tocar(trigger());
  registrar('después de elegir, siguen estando las cinco', opciones().length === 5, textos());

  registrar('se puede volver a Ingreso', await elegir('Ingreso'));
  await tocar(trigger());
  registrar('y de ahí a cualquier otra: siguen las cinco', opciones().length === 5, textos());
  registrar('la elegida queda marcada', opciones().find((o) => o.textContent.includes('Ingreso'))?.getAttribute('aria-selected') === 'true');
}

// ---------------------------------------------------------------- con buscador (Categoría)
{
  const CATEGORIAS = ['Pescadería', 'Carnicería', 'Verdulería', 'Bebidas', 'Limpieza', 'Gas', 'Luz', 'Alquiler', 'Sueldos']
    .map((n, i) => ({ value: String(i), label: n }));
  const { trigger } = await montar({ value: '0', options: CATEGORIAS });

  await tocar(trigger());
  registrar('con lista larga aparece el buscador', !!document.querySelector('[data-slot=picker-popup] input'));
  registrar('al abrir están todas', opciones().length === 9, textos());

  // "eria" está en Pescadería, Carnicería y Verdulería, pero con acento: prueba
  // a la vez que filtra y que ignora los acentos.
  await tipear('eria');
  registrar('tipear filtra', opciones().length === 3, textos());

  await tipear('pescaderia');
  registrar('busca sin acentos', opciones().length === 1 && textos().includes('Pescadería'), textos());

  await tipear('car');
  await elegir('Carnicería');
  registrar('se elige desde lo filtrado', trigger().textContent.includes('Carnicería'), trigger().textContent);

  await tocar(trigger());
  registrar('al volver a abrir, la búsqueda anterior no quedó pegada', opciones().length === 9, textos());
}

if (raiz) await act(async () => raiz.unmount());
await GlobalRegistrator.unregister();

let fallas = 0;
for (const c of casos) {
  if (c.ok) console.log(`OK   ${c.nombre}`);
  else {
    fallas++;
    console.log(`FALLA ${c.nombre}${c.detalle ? ` — ${c.detalle}` : ''}`);
  }
}
process.exit(fallas === 0 ? 0 : 1);
