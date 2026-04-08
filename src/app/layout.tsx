import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/providers/theme-provider";
import { StoreHydrator } from "@/providers/store-hydrator";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Finza — Finanzas Personales",
  description: "Gestión inteligente de tus finanzas personales. Multi-moneda, presupuestos y reportes.",
};

export const viewport: Viewport = {
  themeColor: "#0e0e14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider>
          <StoreHydrator>
            <TooltipProvider delay={300}>
              {children}
            </TooltipProvider>
          </StoreHydrator>
        </ThemeProvider>
      </body>
    </html>
  );
}
