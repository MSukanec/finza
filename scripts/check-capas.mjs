// Las capas de la interfaz: que lo que se abre DESDE algo quede por encima.
//
// Repartidas por los componentes, dos capas terminan con el mismo numero y una
// tapa a la otra. Paso: la hoja "Mas" de mobile quedo en 60 y el desplegable
// del selector de espacios en 50, asi que en el telefono el menu se abria
// DEBAJO de la hoja que lo habia abierto: no se podia cambiar de espacio.
import { readFileSync } from 'node:fs';

const capas = (archivo) => {
  const src = readFileSync(archivo, 'utf8');
  const n = [...src.matchAll(/\bz-\[?(\d+)\]?/g)].map((m) => Number(m[1]));
  return n.length ? Math.max(...n) : null;
};

const FLOTANTE = 70;
const SOBRE_PANTALLA = 60;
const MENU_INFERIOR = 50;

const casos = [
  // Lo que sale de un control tiene que estar arriba de todo lo que lo abrio.
  ['desplegable', capas('src/components/ui/dropdown-menu.tsx'), FLOTANTE],
  ['popover', capas('src/components/ui/popover.tsx'), FLOTANTE],
  ['picker', capas('src/components/ui/picker.tsx'), FLOTANTE],
  ['select', capas('src/components/ui/select.tsx'), FLOTANTE],
  ['tooltip', capas('src/components/ui/tooltip.tsx'), FLOTANTE],
  // Lo que tapa la pantalla.
  ['dialog', capas('src/components/ui/dialog.tsx'), SOBRE_PANTALLA],
  ['drawer', capas('src/components/ui/drawer.tsx'), SOBRE_PANTALLA],
  ['sheet', capas('src/components/ui/sheet.tsx'), SOBRE_PANTALLA],
  // Los avisos, siempre visibles.
  ['toaster', capas('src/components/ui/toaster.tsx'), 80],
];

let fallas = 0;
for (const [nombre, obtenido, esperado] of casos) {
  if (obtenido === esperado) console.log(`OK   ${nombre}: z-${obtenido}`);
  else {
    fallas++;
    console.log(`FALLA ${nombre}: esperaba z-${esperado}, tiene z-${obtenido}`);
  }
}

// La hoja "Mas" de mobile contiene el selector de espacios: el desplegable de
// ese selector TIENE que quedar por encima de la hoja.
const hoja = Math.max(
  ...[...readFileSync('src/app/(app)/layout.tsx', 'utf8').matchAll(/\bz-\[?(\d+)\]?/g)].map((m) =>
    Number(m[1])
  )
);
if (capas('src/components/ui/dropdown-menu.tsx') > hoja) {
  console.log(`OK   el desplegable (z-${FLOTANTE}) queda sobre la hoja de mobile (z-${hoja})`);
} else {
  fallas++;
  console.log(`FALLA el desplegable quedaria DEBAJO de la hoja de mobile (z-${hoja})`);
}

if (hoja > MENU_INFERIOR) {
  console.log(`OK   la hoja (z-${hoja}) tapa el menu de abajo (z-${MENU_INFERIOR})`);
} else {
  fallas++;
  console.log('FALLA la hoja no tapa el menu de abajo');
}

process.exit(fallas === 0 ? 0 : 1);
