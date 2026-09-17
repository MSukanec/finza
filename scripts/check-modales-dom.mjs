// Modales de confirmación y de borrar con reemplazo, con clics sobre un DOM
// simulado (happy-dom).
//
// 1. Una confirmación abierta ENCIMA de otro modal —quitar un comprobante desde
//    el formulario del movimiento, borrar un socio desde el suyo— no puede
//    cerrar el de abajo. Si lo cerrara, se perdería lo que se estaba cargando.
//    Se prueba en ancho de escritorio (diálogo) y de teléfono (hoja de abajo).
// 2. Borrar con reemplazo: sin uso deja eliminar; en uso no deja confirmar
//    hasta elegir con qué reemplazar, y confirma con lo elegido.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const casos = [];
const registrar = (nombre, ok, detalle = '') => casos.push({ nombre, ok, detalle });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function entorno(ancho) {
  GlobalRegistrator.register({ url: 'http://localhost/', width: ancho, height: 800 });
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon';
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // happy-dom no evalúa media queries de ancho: se responde según el ancho
  // simulado, que es lo único que usa la app para elegir diálogo u hoja.
  window.matchMedia = (q) => {
    const min = /min-width:\s*(\d+)px/.exec(q);
    const matches = min ? ancho >= Number(min[1]) : false;
    return { matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  };
  // vaul (la hoja de abajo) lee `transform` del estilo calculado al soltar el
  // dedo, y happy-dom no lo calcula: devuelve undefined y vaul revienta. En un
  // navegador siempre es un texto; acá se completa con el valor por defecto.
  const calcular = window.getComputedStyle.bind(window);
  window.getComputedStyle = (el, pseudo) => {
    const estilo = calcular(el, pseudo);
    return new Proxy(estilo, {
      get: (obj, prop) => {
        const v = Reflect.get(obj, prop);
        if ((prop === 'transform' || prop === 'webkitTransform') && !v) return 'none';
        return typeof v === 'function' ? v.bind(obj) : v;
      },
    });
  };
  // Tampoco trae captura de puntero, que vaul pide al apoyar el dedo.
  for (const metodo of ['setPointerCapture', 'releasePointerCapture']) {
    window.Element.prototype[metodo] ??= () => {};
  }
  window.Element.prototype.hasPointerCapture ??= () => false;
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  return { React, act, createRoot };
}

const textoVisible = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);

async function tocar(act, el) {
  // Si lo que hay que tocar no está, la prueba tiene que FALLAR con su nombre,
  // no cortarse con un error de JavaScript tres pasos después.
  if (!el) return false;
  await act(async () => {
    for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      el.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true }));
    }
    el.click();
  });
  await act(async () => espera(150));
  return true;
}

// ---------------------------------------------------------------- 1. confirmación encima de un modal
for (const [nombre, ancho] of [['escritorio', 1280], ['teléfono', 390]]) {
  const { React, act, createRoot } = await entorno(ancho);
  const modal = await import('../src/components/ui/responsive-modal.tsx');
  const { DialogProvider, useGlobalDialog } = await import('../src/components/providers/dialog-provider.tsx');

  let respuesta = 'sin responder';
  function Formulario() {
    const [abierto, setAbierto] = React.useState(true);
    const dialog = useGlobalDialog();
    return React.createElement(
      modal.ResponsiveModal,
      { open: abierto, onOpenChange: setAbierto },
      React.createElement(
        modal.ResponsiveModalContent,
        null,
        React.createElement(modal.ResponsiveModalHeader, null,
          React.createElement(modal.ResponsiveModalTitle, null, 'Editar movimiento')),
        React.createElement(modal.ResponsiveModalBody, null,
          React.createElement('p', { 'data-prueba': 'formulario' }, 'lo que se estaba cargando'),
          React.createElement('button', {
            type: 'button',
            onClick: async () => { respuesta = await dialog.confirm('Quitar comprobante', '¿Seguro?', { confirmar: 'Quitar' }); },
          }, 'Quitar comprobante'))
      )
    );
  }

  const host = document.createElement('div');
  document.body.appendChild(host);
  const raiz = createRoot(host);
  await act(async () => raiz.render(React.createElement(DialogProvider, null, React.createElement(Formulario))));
  await act(async () => espera(100));

  const formularioAbierto = () => !!document.querySelector('[data-prueba=formulario]');
  registrar(`${nombre}: el formulario arranca abierto`, formularioAbierto());

  await tocar(act, textoVisible('Quitar comprobante'));
  registrar(`${nombre}: se abre la confirmación`, !!textoVisible('Quitar'));

  await tocar(act, textoVisible('Cancelar'));
  registrar(`${nombre}: cancelar responde que no`, respuesta === false, String(respuesta));
  registrar(`${nombre}: cancelar la confirmación NO cierra el formulario`, formularioAbierto());

  await tocar(act, textoVisible('Quitar comprobante'));
  await tocar(act, textoVisible('Quitar'));
  registrar(`${nombre}: confirmar responde que sí`, respuesta === true, String(respuesta));
  registrar(`${nombre}: confirmar NO cierra el formulario`, formularioAbierto());

  await act(async () => raiz.unmount());
  await GlobalRegistrator.unregister();
}

// ---------------------------------------------------------------- 1.b un clic afuera no cierra
//
// Pedido del usuario: un formulario a medio cargar no se pierde por un clic al
// costado. Cerrar sigue siendo la X, Cancelar, Escape o guardar.
for (const [nombre, ancho] of [['escritorio', 1280], ['teléfono', 390]]) {
  const { React, act, createRoot } = await entorno(ancho);
  const modal = await import('../src/components/ui/responsive-modal.tsx');

  function Formulario() {
    const [abierto, setAbierto] = React.useState(true);
    return React.createElement(
      modal.ResponsiveModal,
      { open: abierto, onOpenChange: setAbierto },
      React.createElement(
        modal.ResponsiveModalContent,
        null,
        React.createElement(modal.ResponsiveModalHeader, null,
          React.createElement(modal.ResponsiveModalTitle, null, 'Nuevo movimiento')),
        React.createElement(modal.ResponsiveModalBody, null,
          React.createElement('p', { 'data-prueba': 'formulario' }, 'lo que se estaba cargando')),
        React.createElement(modal.ResponsiveModalFooter, null,
          React.createElement('button', { type: 'button', onClick: () => setAbierto(false) }, 'Guardar'))
      )
    );
  }

  const host = document.createElement('div');
  document.body.appendChild(host);
  const raiz = createRoot(host);
  await act(async () => raiz.render(React.createElement(Formulario)));
  await act(async () => espera(100));

  const abierto = () => !!document.querySelector('[data-prueba=formulario]');
  registrar(`${nombre}: el modal arranca abierto`, abierto());

  // El fondo oscuro: lo que se toca cuando uno hace clic "afuera".
  const fondo = document.querySelector('[data-slot=dialog-overlay], [data-slot=drawer-overlay]');
  registrar(`${nombre}: hay un fondo para tocar`, !!fondo);
  if (fondo) {
    await tocar(act, fondo);
    registrar(`${nombre}: tocar afuera NO cierra el modal`, abierto());
  }

  // Y lo que sí tiene que cerrar, sigue cerrando.
  const seToco = await tocar(act, textoVisible('Guardar'));
  registrar(`${nombre}: guardar sí cierra`, seToco && !abierto(), seToco ? '' : 'el modal ya no estaba');

  await act(async () => raiz.unmount());
  await GlobalRegistrator.unregister();
}

// ---------------------------------------------------------------- 2. borrar con reemplazo
{
  const { React, act, createRoot } = await entorno(1280);
  const { BorrarConReemplazo } = await import('../src/components/borrar-con-reemplazo.tsx');

  async function probar(uso, alConfirmar) {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const raiz = createRoot(host);
    let confirmado = 'nada';
    await act(async () =>
      raiz.render(
        React.createElement(BorrarConReemplazo, {
          abierto: true,
          onCerrar: () => {},
          titulo: 'Eliminar categoría',
          nombre: 'Pescadería',
          cargarUso: async () => uso,
          opciones: [
            { value: 'carne', label: 'Carnicería', hint: 'Proveedores' },
            { value: 'verdu', label: 'Verdulería', hint: 'Proveedores' },
          ],
          onConfirmar: (r) => { confirmado = r; },
        })
      )
    );
    await act(async () => espera(100));
    await alConfirmar({ act, confirmadoCon: () => confirmado });
    await act(async () => raiz.unmount());
  }

  await probar({ total: 0, descripcion: '' }, async ({ act, confirmadoCon }) => {
    registrar('sin uso: dice que no está en uso', !!document.querySelector('[data-estado=libre]'));
    const eliminar = textoVisible('Eliminar');
    registrar('sin uso: deja eliminar directo', !!eliminar && !eliminar.disabled);
    await tocar(act, eliminar);
    registrar('sin uso: confirma sin reemplazo', confirmadoCon() === null, String(confirmadoCon()));
  });

  await probar({ total: 36, descripcion: '34 movimientos y 2 presupuestos' }, async ({ act, confirmadoCon }) => {
    const aviso = document.querySelector('[data-estado=en-uso]');
    registrar('en uso: dice en qué está usada', !!aviso && aviso.textContent.includes('34 movimientos y 2 presupuestos'), aviso?.textContent);
    const boton = textoVisible('Reemplazar y eliminar');
    registrar('en uso: no deja confirmar sin elegir reemplazo', !!boton && boton.disabled);

    await tocar(act, document.querySelector('[data-slot=picker-trigger]'));
    const opcion = [...document.querySelectorAll('[role=option]')].find((o) => o.textContent.includes('Verdulería'));
    await tocar(act, opcion);
    registrar('en uso: elegido el reemplazo, deja confirmar', !textoVisible('Reemplazar y eliminar').disabled);

    await tocar(act, textoVisible('Reemplazar y eliminar'));
    registrar('en uso: confirma con el reemplazo elegido', confirmadoCon() === 'verdu', String(confirmadoCon()));
  });

  await GlobalRegistrator.unregister();
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
