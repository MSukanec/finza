// En qué espacio arranca la app (src/lib/espacios.ts). Ver DB/049.
//
// Nació de la encargada de Samurai: la app la dejaba en su espacio "Principal"
// vacío y veía "no tenés categorías". Tiene que arrancar donde estuvo la última
// vez, aunque haya cerrado sesión o entrado desde otro dispositivo.
const { elegirEspacio } = await import('../src/lib/espacios.ts');

const PRINCIPAL = { id: 'principal' };
const SAMURAI = { id: 'samurai' };
const espacios = [SAMURAI, PRINCIPAL];

const casos = [
  ['arranca donde estuvo la última vez, guardado en la cuenta',
    elegirEspacio(espacios, { enCuenta: 'samurai', enNavegador: 'principal' }) === 'samurai'],
  ['la cuenta gana sobre el navegador: fue la última elección, en cualquier dispositivo',
    elegirEspacio([PRINCIPAL, SAMURAI], { enCuenta: 'samurai', enNavegador: 'principal' }) === 'samurai'],
  ['recién cambiado de espacio, manda el de la sesión',
    elegirEspacio(espacios, { enSesion: 'principal', enCuenta: 'samurai' }) === 'principal'],
  ['después de cerrar sesión (navegador vacío) sigue sabiendo dónde estaba',
    elegirEspacio([PRINCIPAL, SAMURAI], { enCuenta: 'samurai', enNavegador: null }) === 'samurai'],
  ['sin dato en la cuenta, usa el del navegador',
    elegirEspacio(espacios, { enNavegador: 'principal' }) === 'principal'],
  ['si ya no es miembro del guardado, no lo usa',
    elegirEspacio([PRINCIPAL], { enCuenta: 'samurai' }) === 'principal'],
  ['si el de la cuenta no sirve, prueba el del navegador',
    elegirEspacio(espacios, { enCuenta: 'borrado', enNavegador: 'principal' }) === 'principal'],
  ['sin nada guardado, el primero', elegirEspacio(espacios, {}) === 'samurai'],
  ['sin espacios, ninguno', elegirEspacio([], { enCuenta: 'samurai' }) === null],
];

let fallas = 0;
for (const [nombre, ok] of casos) {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}`);
  if (!ok) fallas++;
}
process.exit(fallas ? 1 : 0);
