/**
 * Extracción de texto de un PDF, con las posiciones de cada fragmento.
 *
 * ALCANCE: esto NO es un lector de PDF de propósito general. Lee los resúmenes
 * que emiten los bancos —PDF 1.4, generados por mainframe, sin cifrar y sin
 * object streams— y falla fuerte con cualquier otra cosa en vez de devolver
 * texto a medias. Un resumen mal leído en silencio es peor que uno no leído.
 *
 * Por qué a mano y no con una librería: el resumen de Visa trae el `/ToUnicode`
 * prácticamente vacío (mapea un único carácter), así que los extractores
 * genéricos devuelven basura. Lo que sí trae es el `/Differences` de cada
 * fuente, con nombres de glifo estándar sobre posiciones EBCDIC — el archivo
 * sale de un mainframe. Leer ese mapa es el trabajo real, y una vez hecho el
 * resto es un tokenizador de cien líneas contra un megabyte de dependencia.
 */

/** Un pedazo de texto con su posición en la página. */
export interface FragmentoPdf {
  x: number;
  y: number;
  texto: string;
}

export interface PaginaPdf {
  numero: number;
  fragmentos: FragmentoPdf[];
}

export class ErrorDePdf extends Error {}

const ES_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

/** Nombres de glifo que no son un carácter suelto. */
const GLIFOS: Record<string, string> = {
  space: ' ', period: '.', comma: ',', colon: ':', semicolon: ';', hyphen: '-',
  slash: '/', percent: '%', dollar: '$', asterisk: '*', plus: '+', underscore: '_',
  question: '?', quotedbl: '"', quotesingle: "'", at: '@', numbersign: '#',
  ampersand: '&', parenleft: '(', parenright: ')', bracketleft: '[', bracketright: ']',
  braceleft: '{', braceright: '}', less: '<', greater: '>', equal: '=', bar: '|',
  exclam: '!', asciitilde: '~', asciicircum: '^', grave: '`', backslash: '\\',
  degree: '°', ordmasculine: 'º', ordfeminine: 'ª',
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  adieresis: 'ä', edieresis: 'ë', idieresis: 'ï', odieresis: 'ö', udieresis: 'ü',
  ntilde: 'ñ', ccedilla: 'ç',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  Adieresis: 'Ä', Odieresis: 'Ö', Udieresis: 'Ü', Ntilde: 'Ñ', Ccedilla: 'Ç',
  exclamdown: '¡', questiondown: '¿',
};

/**
 * Descomprime un stream FlateDecode con el inflate del runtime.
 *
 * `DecompressionStream` está en el navegador y en Node desde la 18, así que
 * esto no suma ninguna dependencia. Los PDF usan formato zlib; algunos
 * generadores emiten deflate crudo, de ahí el segundo intento.
 */
async function inflar(datos: Uint8Array): Promise<Uint8Array | null> {
  for (const formato of ['deflate', 'deflate-raw'] as const) {
    try {
      const ds = new DecompressionStream(formato);
      const stream = new Blob([datos as BlobPart]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      // Formato equivocado o stream que no es Flate: se prueba el siguiente.
    }
  }
  return null;
}

function indiceDe(datos: Uint8Array, patron: Uint8Array, desde = 0): number {
  for (let i = desde; i <= datos.length - patron.length; i++) {
    let ok = true;
    for (let j = 0; j < patron.length; j++) {
      if (datos[i + j] !== patron[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

const bytesDe = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const textoDe = (b: Uint8Array) => String.fromCharCode(...b);

/** Cada byte como el carácter de ese punto de código, en tramos para no volar la pila. */
function comoLatin1(datos: Uint8Array): string {
  const TRAMO = 0x8000;
  let s = '';
  for (let i = 0; i < datos.length; i += TRAMO) {
    s += String.fromCharCode(...datos.subarray(i, i + TRAMO));
  }
  return s;
}

/**
 * El mapa de bytes a caracteres, leído de los `/Differences` del archivo.
 *
 * Un PDF puede traer varios: uno por fuente. Acá se fusionan los que tienen
 * entidad —los de una o dos entradas son para fuentes decorativas y mapean el
 * mismo byte a otra cosa— y si dos mapas se contradicen se corta, porque
 * elegir uno al azar produce texto plausible y equivocado.
 */
function leerCodificacion(crudo: string): Map<number, string> {
  const mapa = new Map<number, string>();
  const conflictos: number[] = [];

  for (const m of crudo.matchAll(/\/Differences\s*\[([^\]]*)\]/g)) {
    const tokens = m[1].match(/\d+|\/[A-Za-z0-9]+/g) ?? [];
    // Los mapas de una o dos entradas son de fuentes que dibujan un símbolo
    // suelto y no describen la codificación del texto.
    if (tokens.length < 10) continue;

    let codigo = 0;
    for (const tok of tokens) {
      if (tok[0] !== '/') { codigo = Number(tok); continue; }
      const nombre = tok.slice(1);
      const ch = GLIFOS[nombre] ?? (nombre.length === 1 ? nombre : '�');
      const previo = mapa.get(codigo);
      if (previo !== undefined && previo !== ch) conflictos.push(codigo);
      else mapa.set(codigo, ch);
      codigo++;
    }
  }

  if (conflictos.length) {
    throw new ErrorDePdf(
      `El PDF trae mapas de codificación que se contradicen en ${conflictos.length} caracteres. ` +
        'No puedo leerlo sin arriesgar texto equivocado.'
    );
  }
  return mapa;
}

const ESCAPES: Record<number, number> = {
  0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12, 0x28: 40, 0x29: 41, 0x5c: 92,
};

/**
 * Recorre un content stream y devuelve los textos con su posición.
 *
 * Va a mano y no con expresiones regulares porque las cadenas de PDF admiten
 * paréntesis anidados y escapes octales: cualquier regex que intente abarcarlo
 * o se cuelga o corta las cadenas por la mitad.
 */
function recorrerContenido(st: Uint8Array, mapa: Map<number, string>): FragmentoPdf[] {
  const salida: FragmentoPdf[] = [];
  const numeros: number[] = [];
  let pendiente: number[] = [];
  let x = 0;
  let y = 0;
  let i = 0;

  const decodificar = (bytes: number[]) => bytes.map((c) => mapa.get(c) ?? '�').join('');

  while (i < st.length) {
    const c = st[i];

    // Cadena: (texto)
    if (c === 0x28) {
      i++;
      let nivel = 1;
      const buf: number[] = [];
      while (i < st.length) {
        const ch = st[i];
        if (ch === 0x5c && i + 1 < st.length) {
          const sig = st[i + 1];
          if (ESCAPES[sig] !== undefined) { buf.push(ESCAPES[sig]); i += 2; continue; }
          if (sig >= 0x30 && sig <= 0x37) {
            let j = i + 1;
            let oct = '';
            while (j < st.length && oct.length < 3 && st[j] >= 0x30 && st[j] <= 0x37) {
              oct += String.fromCharCode(st[j]); j++;
            }
            buf.push(parseInt(oct, 8) & 0xff); i = j; continue;
          }
          buf.push(sig); i += 2; continue;
        }
        if (ch === 0x28) nivel++;
        else if (ch === 0x29 && --nivel === 0) { i++; break; }
        buf.push(ch); i++;
      }
      pendiente = pendiente.concat(buf);
      continue;
    }

    // Número
    if ((c >= 0x30 && c <= 0x39) || c === 0x2e || c === 0x2d) {
      let j = i;
      while (j < st.length && ((st[j] >= 0x30 && st[j] <= 0x39) || st[j] === 0x2e || st[j] === 0x2d)) j++;
      const n = Number(textoDe(st.subarray(i, j)));
      if (Number.isFinite(n)) numeros.push(n);
      i = j;
      continue;
    }

    // Operador
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x27 || c === 0x22) {
      let j = i;
      while (j < st.length && ((st[j] >= 0x41 && st[j] <= 0x5a) || (st[j] >= 0x61 && st[j] <= 0x7a) || st[j] === 0x2a)) j++;
      // Los operadores ' y " no son letras: el barrido de arriba no los consume
      // y hay que avanzar a mano, o el recorrido se queda clavado en el mismo
      // byte para siempre.
      if (j === i) j = i + 1;
      const op = textoDe(st.subarray(i, j));
      i = j;

      if ((op === 'Td' || op === 'TD') && numeros.length >= 2) {
        x = numeros[numeros.length - 2];
        y = numeros[numeros.length - 1];
      } else if (op === 'Tm' && numeros.length >= 6) {
        x = numeros[numeros.length - 2];
        y = numeros[numeros.length - 1];
      } else if ((op === 'Tj' || op === 'TJ' || op === "'" || op === '"') && pendiente.length) {
        const texto = decodificar(pendiente);
        if (texto.trim()) salida.push({ x, y, texto });
        pendiente = [];
      }
      numeros.length = 0;
      continue;
    }

    i++;
  }

  return salida;
}

/**
 * Abre el PDF y devuelve una lista de páginas con sus fragmentos de texto.
 *
 * Una "página" acá es un content stream con texto, en el orden en que aparece
 * en el archivo. Para los resúmenes que leemos eso coincide con las páginas
 * reales; no se resuelve el árbol de páginas, que exigiría seguir referencias
 * indirectas para nada.
 */
export async function leerPdf(buffer: ArrayBuffer | Uint8Array): Promise<PaginaPdf[]> {
  const datos = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (indiceDe(datos.subarray(0, 1024), ES_PDF) === -1) {
    throw new ErrorDePdf('El archivo no es un PDF.');
  }

  // Byte a carácter, sin TextDecoder: no existe un decodificador Latin-1 de
  // verdad —la etiqueta "latin1" del estándar apunta a windows-1252, que remapea
  // 0x80-0x9F— y acá hace falta que el byte 0x93 siga siendo 0x93. Sobre este
  // texto sólo se buscan patrones ASCII; las cadenas reales se decodifican
  // después con el mapa de la fuente.
  const crudo = comoLatin1(datos);

  if (crudo.includes('/Encrypt')) {
    throw new ErrorDePdf('El PDF está protegido con contraseña.');
  }

  const mapa = leerCodificacion(crudo);
  if (mapa.size === 0) {
    throw new ErrorDePdf(
      'El PDF no declara la codificación de sus fuentes (/Differences). Puede ser un escaneo, ' +
        'y una imagen no se puede importar.'
    );
  }

  const paginas: PaginaPdf[] = [];
  const marca = bytesDe('stream');
  let desde = 0;

  while (true) {
    const ini = indiceDe(datos, marca, desde);
    if (ini === -1) break;

    // Después de `stream` viene CRLF o LF, y ahí arranca el contenido.
    let p = ini + marca.length;
    if (datos[p] === 0x0d) p++;
    if (datos[p] === 0x0a) p++;

    const fin = indiceDe(datos, bytesDe('endstream'), p);
    if (fin === -1) break;
    // Se salta el `endstream` entero: si no, la propia palabra contiene
    // "stream" y la búsqueda siguiente se engancha ahí y se desincroniza.
    desde = fin + 'endstream'.length;

    // El salto de línea que separa el contenido de `endstream` no es parte del
    // stream, y el inflate del runtime rechaza cualquier byte de sobra con un
    // "trailing junk" en vez de ignorarlo.
    let corte = fin;
    while (corte > p && (datos[corte - 1] === 0x0a || datos[corte - 1] === 0x0d)) corte--;

    const inflado = (await inflar(datos.subarray(p, corte))) ?? (await inflar(datos.subarray(p, fin)));
    if (!inflado) continue;

    const fragmentos = recorrerContenido(inflado, mapa);
    if (fragmentos.length) paginas.push({ numero: paginas.length + 1, fragmentos });
  }

  if (!paginas.length) {
    throw new ErrorDePdf('No encontré texto en el PDF. Si es un escaneo, no se puede importar.');
  }

  return paginas;
}

/**
 * Junta los fragmentos de una página en líneas, por coordenada vertical.
 *
 * `tolerancia` existe porque el mainframe emite algunos campos medio punto más
 * abajo que el resto de su fila —el número de comprobante, por ejemplo— y sin
 * agrupar por cercanía esa fila se parte en dos.
 */
export function agruparEnLineas(pagina: PaginaPdf, tolerancia = 1.5): FragmentoPdf[][] {
  const orden = [...pagina.fragmentos].sort((a, b) => b.y - a.y || a.x - b.x);
  const lineas: FragmentoPdf[][] = [];

  for (const f of orden) {
    const ultima = lineas[lineas.length - 1];
    if (ultima && Math.abs(ultima[0].y - f.y) <= tolerancia) ultima.push(f);
    else lineas.push([f]);
  }

  for (const l of lineas) l.sort((a, b) => a.x - b.x);
  return lineas;
}
