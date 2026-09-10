import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next build` y `next dev` comparten `.next` por defecto, así que un build
  // de producción pisa los chunks que el server de desarrollo está sirviendo:
  // la app queda mostrando CSS y JS viejos hasta que se borra el directorio.
  // Con esto el build va a su propio lugar y nunca toca al dev.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
