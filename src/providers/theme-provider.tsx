'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    // forcedTheme, no defaultTheme: ignora la preferencia del sistema y también
    // cualquier "dark" que haya quedado guardado en localStorage de antes.
    // Los estilos .dark siguen en globals.css por si más adelante volvemos a
    // ofrecer el cambio de tema.
    <NextThemesProvider attribute="class" forcedTheme="light" enableSystem={false}>
      {children}
    </NextThemesProvider>
  );
}
