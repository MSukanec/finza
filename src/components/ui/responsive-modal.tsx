import * as React from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

const DesktopContext = React.createContext<boolean | undefined>(undefined);

export function ResponsiveModal({ children, open, onOpenChange }: { children: React.ReactNode, open: boolean, onOpenChange: (open: boolean) => void }) {
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

export function ResponsiveModalContent({ children, className }: { children: React.ReactNode, className?: string }) {
  const isDesktop = React.useContext(DesktopContext)
  
  if (isDesktop === undefined) return null;

  if (isDesktop) {
    return (
      <DialogContent className={cn("sm:max-w-md p-6 max-h-[85dvh] overflow-y-auto", className)}>
        {children}
      </DialogContent>
    )
  }

  return (
    <DrawerContent className={cn("max-h-[96dvh] mt-24", className)}>
      <div className="p-4 max-h-full overflow-y-auto">
        {children}
      </div>
    </DrawerContent>
  )
}

export function ResponsiveModalHeader({ children, className }: { children: React.ReactNode, className?: string }) {
  const isDesktop = React.useContext(DesktopContext)
  
  if (isDesktop === undefined) return null;

  if (isDesktop) {
    return <DialogHeader className={className}>{children}</DialogHeader>
  }

  return <DrawerHeader className={cn("text-left pb-4 pt-2", className)}>{children}</DrawerHeader>
}

export function ResponsiveModalTitle({ children, className }: { children: React.ReactNode, className?: string }) {
  const isDesktop = React.useContext(DesktopContext)
  
  if (isDesktop === undefined) return null;

  if (isDesktop) {
    return <DialogTitle className={className}>{children}</DialogTitle>
  }

  return <DrawerTitle className={className}>{children}</DrawerTitle>
}

export function ResponsiveModalDescription({ children, className }: { children: React.ReactNode, className?: string }) {
    const isDesktop = React.useContext(DesktopContext)
    
    if (isDesktop === undefined) return null;
  
    if (isDesktop) {
      return <DialogDescription className={className}>{children}</DialogDescription>
    }
  
    return <DrawerDescription className={className}>{children}</DrawerDescription>
}
