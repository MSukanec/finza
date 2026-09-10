// Build de verificación.
//
// `next build` y `next dev` comparten `.next`: correr un build con el server de
// desarrollo levantado pisa los chunks que ese server está sirviendo, y la app
// queda mostrando CSS y JS viejos hasta que se borra el directorio. Ya pasó.
//
// Este script manda el build a `.next-build`, así se puede compilar para
// verificar sin tocar lo que el dev está usando.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Se resuelve el binario de next del propio proyecto en vez de depender de que
// `npx` esté en el PATH del shell que llame a esto.
const nextBin = require.resolve('next/dist/bin/next');

const { status } = spawnSync(process.execPath, [nextBin, 'build'], {
  stdio: 'inherit',
  env: { ...process.env, NEXT_DIST_DIR: '.next-build' },
});

process.exit(status ?? 1);
