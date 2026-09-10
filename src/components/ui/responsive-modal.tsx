import * as React from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

/**
 * Modal de la app: diálogo en desktop, hoja en mobile.
 *
 * Estructura fija: encabezado y pie quedan quietos, y SÓLO el cuerpo scrollea.
 * Antes todo el contenido —botón de guardar incluido— vivía dentro de un único
 * contenedor con `overflow-y-auto`, así que en un formulario largo el botón
 * quedaba fuera de vista y había que scrollear para encontrarlo.
 *
 * Nunca hay scroll horizontal: el cuerpo lo bloquea explícitamente. Aparecía
 * cuando un select con texto largo (`whitespace-nowrap`) desbordaba su caja.
 */

const DesktopContext = React.createContext<boolean | undefined>(undefined)

export function ResponsiveModal({
  children,
  open,
  onOpenChange,
}: {
  children: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <DesktopContext.Provider value={isDesktop}>
      {isDesktop ? (
        <Dialog open={open} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      ) : (
        <Drawer open={open} onOpenChange={onOpenChange}>
          {children}
        </Drawer>
      )}
    </DesktopContext.Provider>
  )
}

export function ResponsiveModalContent({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const isDesktop = React.useContext(DesktopContext)
  if (isDesktop === undefined) return null

  if (isDesktop) {
    return (
      <DialogContent
        className={cn(
          // flex, no grid: el cuerpo tiene que poder crecer y el resto quedarse fijo.
          "flex max-h-[85dvh] flex-col overflow-hidden p-0 sm:max-w-md",
          className
        )}
      >
        {children}
      </DialogContent>
    )
  }

  return (
    <DrawerContent className={cn("mt-24 flex max-h-[92dvh] flex-col overflow-hidden", className)}>
      {children}
    </DrawerContent>
  )
}

export function ResponsiveModalHeader({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-b border-border/60 px-5 py-4 pr-12",
        className
      )}
    >
      {children}
    </div>
  )
}

/** El único tramo que scrollea. Sin scroll horizontal, nunca. */
export function ResponsiveModalBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5",
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Acciones. El footer NO contiene el botón: el footer ES el botón.
 *
 * Va a sangre, sin padding, con una línea recta arriba. Las esquinas inferiores
 * las recorta el propio modal, que ya tiene `rounded-2xl` + `overflow-hidden`,
 * así que el botón hereda la curva sin declararla.
 *
 * Los hijos se estiran solos: no hace falta que cada formulario repita
 * `h-12 w-full`. Con dos botones, el espacio se reparte.
 */
export function ResponsiveModalFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 border-t border-border/60 bg-card",
        "pb-[env(safe-area-inset-bottom)]",
        "[&>*]:h-14 [&>*]:flex-1 [&>*]:rounded-none [&>*]:border-0 [&>*]:text-base [&>*]:font-semibold",
        className
      )}
    >
      {children}
    </div>
  )
}

export function ResponsiveModalTitle({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const isDesktop = React.useContext(DesktopContext)
  if (isDesktop === undefined) return null

  const cls = cn("text-base font-semibold tracking-tight", className)
  return isDesktop ? (
    <DialogTitle className={cls}>{children}</DialogTitle>
  ) : (
    <DrawerTitle className={cls}>{children}</DrawerTitle>
  )
}

export function ResponsiveModalDescription({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const isDesktop = React.useContext(DesktopContext)
  if (isDesktop === undefined) return null

  const cls = cn("mt-0.5 text-sm text-muted-foreground", className)
  return isDesktop ? (
    <DialogDescription className={cls}>{children}</DialogDescription>
  ) : (
    <DrawerDescription className={cls}>{children}</DrawerDescription>
  )
}
