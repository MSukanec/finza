'use client';

import React, { createContext, useContext, useState } from 'react';
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalDescription,
  ResponsiveModalBody,
  ResponsiveModalFooter,
} from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAutoFoco } from '@/components/ui/autofocus';

/**
 * Los modales que cualquier pantalla puede pedir sin armar uno propio:
 * confirmar, pedir un texto y avisar.
 *
 * Toda acción destructiva de la app pasa por `confirm` antes de ejecutarse.
 * Borrar algo que puede estar en uso —una categoría, un macrogrupo— usa en
 * cambio `BorrarConReemplazo`, que además dice en qué está usado y deja elegir
 * con qué reemplazarlo.
 */
type DialogContextType = {
  confirm: (title: string, message: string, opciones?: { confirmar?: string }) => Promise<boolean>;
  prompt: (title: string, message?: string, defaultValue?: string) => Promise<string | null>;
  /** Aviso de un solo botón. Reemplaza los alert() del navegador. */
  notify: (title: string, message: string) => void;
};

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function useGlobalDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error('useGlobalDialog must be used within DialogProvider');
  return context;
}

type Confirmacion = { title: string; message: string; confirmar: string; resolve: (ok: boolean) => void };
type Pedido = { title: string; message: string; value: string; resolve: (valor: string | null) => void };

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const autoFoco = useAutoFoco();
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [aviso, setAviso] = useState<{ title: string; message: string } | null>(null);

  const confirm: DialogContextType['confirm'] = (title, message, opciones) =>
    new Promise<boolean>((resolve) => {
      setConfirmacion({ title, message, confirmar: opciones?.confirmar ?? 'Continuar', resolve });
    });

  const prompt: DialogContextType['prompt'] = (title, message, defaultValue) =>
    new Promise<string | null>((resolve) => {
      setPedido({ title, message: message || '', value: defaultValue || '', resolve });
    });

  const notify: DialogContextType['notify'] = (title, message) => setAviso({ title, message });

  // Cerrar por cualquier vía —la X, tocar afuera, deslizar la hoja— cuenta como
  // cancelar. Sin esto, la promesa quedaba sin resolver y quien esperaba la
  // respuesta se quedaba esperando para siempre.
  const cerrarConfirmacion = (ok: boolean) => {
    confirmacion?.resolve(ok);
    setConfirmacion(null);
  };
  const cerrarPedido = (valor: string | null) => {
    pedido?.resolve(valor);
    setPedido(null);
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt, notify }}>
      {children}

      <ResponsiveModal open={!!aviso} onOpenChange={(open) => !open && setAviso(null)}>
        {aviso && (
          <ResponsiveModalContent>
            <ResponsiveModalHeader>
              <ResponsiveModalTitle>{aviso.title}</ResponsiveModalTitle>
              <ResponsiveModalDescription>{aviso.message}</ResponsiveModalDescription>
            </ResponsiveModalHeader>
            <ResponsiveModalFooter>
              <Button onClick={() => setAviso(null)}>Entendido</Button>
            </ResponsiveModalFooter>
          </ResponsiveModalContent>
        )}
      </ResponsiveModal>

      <ResponsiveModal open={!!confirmacion} onOpenChange={(open) => !open && cerrarConfirmacion(false)}>
        {confirmacion && (
          <ResponsiveModalContent>
            <ResponsiveModalHeader>
              <ResponsiveModalTitle>{confirmacion.title}</ResponsiveModalTitle>
              <ResponsiveModalDescription>{confirmacion.message}</ResponsiveModalDescription>
            </ResponsiveModalHeader>
            <ResponsiveModalFooter>
              <Button variant="ghost" onClick={() => cerrarConfirmacion(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={() => cerrarConfirmacion(true)}>
                {confirmacion.confirmar}
              </Button>
            </ResponsiveModalFooter>
          </ResponsiveModalContent>
        )}
      </ResponsiveModal>

      <ResponsiveModal open={!!pedido} onOpenChange={(open) => !open && cerrarPedido(null)}>
        {pedido && (
          <ResponsiveModalContent>
            <ResponsiveModalHeader>
              <ResponsiveModalTitle>{pedido.title}</ResponsiveModalTitle>
              {pedido.message && <ResponsiveModalDescription>{pedido.message}</ResponsiveModalDescription>}
            </ResponsiveModalHeader>
            <ResponsiveModalBody>
              <Input
                autoFocus={autoFoco}
                value={pedido.value}
                onChange={(e) => setPedido((p) => (p ? { ...p, value: e.target.value } : null))}
                onKeyDown={(e) => e.key === 'Enter' && cerrarPedido(pedido.value)}
              />
            </ResponsiveModalBody>
            <ResponsiveModalFooter>
              <Button variant="ghost" onClick={() => cerrarPedido(null)}>
                Cancelar
              </Button>
              <Button onClick={() => cerrarPedido(pedido.value)}>Guardar</Button>
            </ResponsiveModalFooter>
          </ResponsiveModalContent>
        )}
      </ResponsiveModal>
    </DialogContext.Provider>
  );
}
