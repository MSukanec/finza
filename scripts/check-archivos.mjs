// Reglas de los comprobantes adjuntos (src/lib/adjuntos.ts).
//
// La más importante es la última tanda: los límites del cliente tienen que ser
// los MISMOS que los del bucket en DB/044. Si se separan, la app dice "se puede"
// y storage lo rechaza con un mensaje en inglés, o al revés: la app frena un
// archivo que la base aceptaría.
import fs from 'node:fs';

const { rutaDeAdjunto, validarAdjunto, tipoDeAdjunto, pesoLegible, TAMANIO_MAXIMO, ACEPTA } =
  await import('../src/lib/adjuntos.ts');

const casos = [];
const registrar = (nombre, ok, detalle = '') => casos.push({ nombre, ok, detalle });

const WS = '06a79300-cec3-49b1-841b-de5a032754f5';
const TX = '11111111-2222-3333-4444-555555555555';
const ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- la ruta
{
  const ruta = rutaDeAdjunto(WS, TX, ID, 'Factura Nº 1083 (copia).pdf');
  const [espacio, movimiento, archivo] = ruta.split('/');

  // Las políticas leen el espacio y el movimiento de las dos primeras carpetas.
  registrar('la ruta empieza con el espacio', espacio === WS && UUID.test(espacio));
  registrar('la segunda carpeta es el movimiento', movimiento === TX && UUID.test(movimiento));
  registrar('son exactamente tres tramos', ruta.split('/').length === 3, ruta);

  // Storage rechaza claves con "Nº", paréntesis o espacios.
  registrar('el nombre queda sólo con caracteres seguros', /^[A-Za-z0-9._-]+$/.test(archivo), archivo);
  registrar('conserva la extensión', archivo.endsWith('.pdf'), archivo);
  registrar('lleva el id adelante', archivo.startsWith(`${ID}-`), archivo);

  const otra = rutaDeAdjunto(WS, TX, 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee', 'Factura Nº 1083 (copia).pdf');
  registrar('dos archivos con el mismo nombre no se pisan', otra !== ruta);

  registrar('saca los acentos en vez de romperse', rutaDeAdjunto(WS, TX, ID, 'Pescadería.jpg').endsWith('-Pescaderia.jpg'));
  registrar('un nombre sin nada rescatable no queda vacío', rutaDeAdjunto(WS, TX, ID, '¿¿??').endsWith(`${ID}-archivo`));
  registrar('una barra en el nombre no agrega carpetas', rutaDeAdjunto(WS, TX, ID, 'a/b/c.pdf').split('/').length === 3);
  registrar('un nombre larguísimo se recorta y conserva la extensión',
    (() => { const r = rutaDeAdjunto(WS, TX, ID, `${'x'.repeat(300)}.pdf`); return r.length < 200 && r.endsWith('.pdf'); })());
}

// ---------------------------------------------------------------- tipos y tamaño
const archivo = (name, type, size = 1000) => ({ name, type, size });
{
  registrar('un PDF se puede', validarAdjunto(archivo('factura.pdf', 'application/pdf')) === null);
  registrar('una foto de iPhone se puede', validarAdjunto(archivo('IMG_0001.HEIC', 'image/heic')) === null);
  registrar('un Excel sin tipo del navegador se reconoce por la extensión',
    validarAdjunto(archivo('resumen.xlsx', '')) === null);
  registrar('un XML de factura electrónica sin tipo se reconoce', tipoDeAdjunto(archivo('fe.xml', '')) === 'text/xml');
  registrar('un ejecutable no', validarAdjunto(archivo('virus.exe', 'application/x-msdownload')) !== null);
  registrar('algo sin tipo ni extensión conocida no', validarAdjunto(archivo('misterio', '')) !== null);
  registrar('un archivo vacío no', validarAdjunto(archivo('vacio.pdf', 'application/pdf', 0)) !== null);
  registrar('25 MB justos se pueden', validarAdjunto(archivo('grande.pdf', 'application/pdf', TAMANIO_MAXIMO)) === null);
  registrar('un byte más de 25 MB no', validarAdjunto(archivo('enorme.pdf', 'application/pdf', TAMANIO_MAXIMO + 1)) !== null);
  registrar('el aviso de tamaño dice cuánto pesa', /30 MB/.test(validarAdjunto(archivo('x.pdf', 'application/pdf', 30 * 1024 * 1024)) ?? ''));
  registrar('el selector ofrece la cámara', ACEPTA.split(',').includes('image/*'));
  registrar('peso legible en KB', pesoLegible(340 * 1024) === '340 KB');
  registrar('peso legible en MB con coma', pesoLegible(2.4 * 1024 * 1024) === '2,4 MB', pesoLegible(2.4 * 1024 * 1024));
}

// ---------------------------------------------------------------- cliente = bucket
{
  const sql = fs.readFileSync('DB/044_adjuntos_de_movimientos.sql', 'utf8');
  const bloque = sql.slice(sql.indexOf("'adjuntos', 'adjuntos'"), sql.indexOf('ON CONFLICT'));
  const tamanioSql = Number(bloque.match(/\n\s*(\d+),/)?.[1]);
  const tiposSql = new Set([...bloque.matchAll(/'([a-z]+\/[^']+)'/g)].map((m) => m[1]));

  registrar('el tamaño máximo es el mismo que el del bucket', tamanioSql === TAMANIO_MAXIMO,
    `bucket ${tamanioSql}, cliente ${TAMANIO_MAXIMO}`);

  // Todo lo que el cliente deja pasar lo tiene que aceptar el bucket.
  const extensiones = ['pdf', 'jpg', 'png', 'webp', 'heic', 'txt', 'csv', 'xml', 'xls', 'xlsx', 'doc', 'docx', 'zip'];
  const rechazaria = extensiones
    .map((e) => tipoDeAdjunto(archivo(`x.${e}`, '')))
    .filter((t) => !(t.startsWith('image/') ? tiposSql.has('image/*') : tiposSql.has(t)));
  registrar('todo tipo que acepta el cliente lo acepta el bucket', rechazaria.length === 0, rechazaria.join(', '));
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
