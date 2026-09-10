/**
 * Lectura de archivos delimitados (CSV/TSV) que vienen de planillas reales.
 *
 * Nada de esto es teórico: cada función existe porque el Excel del que salen
 * los movimientos rompía el parseo de una forma distinta. Ver `values.ts` para
 * montos y fechas, y `columns.ts` para el mapeo de encabezados.
 */

/** Acentos y signos que sólo aparecen si la codificación se eligió bien. */
const ACENTOS = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/g;

/** Codificaciones candidatas, en orden de probabilidad para planillas locales. */
const CODIFICACIONES = ['utf-8', 'windows-1252', 'macintosh'] as const;

export interface TextoDecodificado {
  texto: string;
  codificacion: string;
}

/**
 * Decide la codificación midiendo el resultado, en vez de asumirla.
 *
 * Excel casi nunca exporta UTF-8: según el sistema sale en cp1252 (Windows) o
 * Mac Roman (macOS). Si se elige mal, cada acento queda como basura y NINGUNA
 * categoría acentuada matchea ("Salmón", "Carnicería", "Verdulería") — el
 * importador cree que todas son nuevas y ofrece crear duplicados.
 *
 * Gana la que produce más letras acentuadas españolas válidas, penalizando el
 * carácter de reemplazo.
 */
export function decodificar(buffer: ArrayBuffer | Uint8Array): TextoDecodificado {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let mejor: TextoDecodificado & { puntaje: number } = {
    texto: '',
    codificacion: 'utf-8',
    puntaje: -Infinity,
  };

  for (const codificacion of CODIFICACIONES) {
    let texto: string;
    try {
      texto = new TextDecoder(codificacion, { fatal: false }).decode(bytes);
    } catch {
      continue; // El runtime no conoce esta codificación.
    }
    const puntaje = (texto.match(ACENTOS) || []).length - (texto.match(/�/g) || []).length * 2;
    if (puntaje > mejor.puntaje) mejor = { texto, codificacion, puntaje };
  }

  // El BOM sobrevive a la decodificación y ensucia el primer encabezado.
  return { texto: mejor.texto.replace(/^﻿/, ''), codificacion: mejor.codificacion };
}

/** El delimitador es el que más aparece en la primera línea con contenido. */
export function detectarDelimitador(texto: string): string {
  const primera = texto.split(/\r\n|\r|\n/).find((l) => l.trim().length > 0) ?? '';
  const candidatos = [';', ',', '\t', '|'];
  let mejor = ',';
  let max = 0;
  for (const c of candidatos) {
    const n = primera.split(c).length - 1;
    if (n > max) { max = n; mejor = c; }
  }
  return mejor;
}

/**
 * Parser de CSV con comillas, escrito a mano por una razón puntual.
 *
 * Este Excel corta las filas con CR solo (`\r`), no con CRLF ni LF, y los LF
 * que aparecen son saltos de línea DENTRO de celdas entrecomilladas. Un parser
 * que trate el CR como carácter ignorable arma una sola fila gigante y devuelve
 * cero resultados.
 */
export function parsearDelimitado(texto: string, delimitador: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];

    if (entreComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else campo += ch;
      continue;
    }

    if (ch === '"') { entreComillas = true; continue; }
    if (ch === delimitador) { fila.push(campo); campo = ''; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
      continue;
    }
    campo += ch;
  }

  if (campo.length || fila.length) { fila.push(campo); filas.push(fila); }

  // Una fila con todas las celdas vacías es ruido de la planilla, no un dato.
  return filas.filter((f) => f.some((c) => c.trim().length > 0));
}
