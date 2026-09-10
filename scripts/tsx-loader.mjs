// Loader minimo para poder importar .ts/.tsx desde node en los scripts de
// verificacion. Usa el compilador de TypeScript que ya esta en el proyecto, en
// vez de sumar tsx o esbuild como dependencia solo para esto.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONES = ['.tsx', '.ts', '.jsx', '.js'];

export async function resolve(specifier, context, next) {
  // El alias `@/` del tsconfig.
  if (specifier.startsWith('@/')) {
    const base = path.join(RAIZ, 'src', specifier.slice(2));
    for (const ext of ['', ...EXTENSIONES]) {
      try {
        const candidato = base + ext;
        await readFile(candidato);
        return { url: pathToFileURL(candidato).href, shortCircuit: true };
      } catch {}
    }
  }

  // Import relativo sin extension (comun en TS).
  if (specifier.startsWith('.') && !path.extname(specifier)) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const ext of EXTENSIONES) {
      try {
        await readFile(base + ext);
        return { url: pathToFileURL(base + ext).href, shortCircuit: true };
      } catch {}
    }
  }

  return next(specifier, context);
}

export async function load(url, context, next) {
  if (!/\.tsx?$/.test(url)) return next(url, context);

  const fuente = await readFile(fileURLToPath(url), 'utf8');
  const { outputText } = ts.transpileModule(fuente, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: fileURLToPath(url),
  });

  return { format: 'module', source: outputText, shortCircuit: true };
}
