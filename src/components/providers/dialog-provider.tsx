'use client';

import React, { createContext, useContext, useState, useRef } from 'react';
import { ResponsiveModal, ResponsiveModalContent, ResponsiveModalHeader, ResponsiveModalTitle, ResponsiveModalDescription } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFinanceStore } from '@/stores/finance-store';

type DialogContextType = {
  confirm: (title: string, message: string) => Promise<boolean>;
  prompt: (title: string, message?: string, defaultValue?: string) => Promise<string | null>;
  deleteCategory: (category: any) => Promise<boolean>;
};

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function useGlobalDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error('useGlobalDialog must be used within DialogProvider');
  return context;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  // Confirm State
  const [confirmState, setConfirmState] = useState<{ isOpen: boolean; title: string; message: string; resolve: (val: boolean) => void } | null>(null);
  
  // Prompt State
  const [promptState, setPromptState] = useState<{ isOpen: boolean; title: string; message: string; value: string; resolve: (val: string | null) => void } | null>(null);

  // Category Delete State
  const [catDeleteState, setCatDeleteState] = useState<{ isOpen: boolean; category: any; targetId: string; resolve: (val: boolean) => void } | null>(null);

  const categories = useFinanceStore(s => s.categories);
  const removeCategoryAndTransfer = useFinanceStore(s => s.removeCategoryAndTransfer);
  const removeCategory = useFinanceStore(s => s.removeCategory);

  const handleConfirm = (title: string, message: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ isOpen: true, title, message, resolve });
    });
  };

  const handlePrompt = (title: string, message?: string, defaultValue?: string) => {
    return new Promise<string | null>((resolve) => {
      setPromptState({ isOpen: true, title, message: message || '', value: defaultValue || '', resolve });
    });
  };

  const handleDeleteCategory = (category: any) => {
    return new Promise<boolean>((resolve) => {
      if (category.stats?.uses > 0) {
        setCatDeleteState({ isOpen: true, category, targetId: '', resolve });
      } else {
        handleConfirm('Eliminar Categoría', `¿Estás seguro de que deseas eliminar permanentemente la categoría "${category.name}"?`).then(async (ok) => {
           if (ok) {
               await removeCategory(category.id);
           }
           resolve(ok);
        });
      }
    });
  };

  return (
    <DialogContext.Provider value={{ confirm: handleConfirm, prompt: handlePrompt, deleteCategory: handleDeleteCategory }}>
      {children}

      {/* CONFIRM MODAL */}
      <ResponsiveModal open={!!confirmState?.isOpen} onOpenChange={(open) => { if (!open && confirmState) { confirmState.resolve(false); setConfirmState(null); } }}>
         {confirmState && (
           <ResponsiveModalContent>
             <ResponsiveModalHeader>
               <ResponsiveModalTitle>{confirmState.title}</ResponsiveModalTitle>
               <ResponsiveModalDescription>{confirmState.message}</ResponsiveModalDescription>
             </ResponsiveModalHeader>
             <div className="flex justify-end gap-3 mt-4">
               <Button variant="outline" onClick={() => { confirmState.resolve(false); setConfirmState(null); }}>Cancelar</Button>
               <Button variant="destructive" onClick={() => { confirmState.resolve(true); setConfirmState(null); }}>Continuar</Button>
             </div>
           </ResponsiveModalContent>
         )}
      </ResponsiveModal>

      {/* PROMPT MODAL */}
      <ResponsiveModal open={!!promptState?.isOpen} onOpenChange={(open) => { if (!open && promptState) { promptState.resolve(null); setPromptState(null); } }}>
         {promptState && (
           <ResponsiveModalContent>
             <ResponsiveModalHeader>
               <ResponsiveModalTitle>{promptState.title}</ResponsiveModalTitle>
               {promptState.message && <ResponsiveModalDescription>{promptState.message}</ResponsiveModalDescription>}
             </ResponsiveModalHeader>
             <div className="mt-4 flex flex-col gap-4">
               <Input 
                 autoFocus 
                 value={promptState.value} 
                 onChange={(e) => setPromptState(prev => prev ? { ...prev, value: e.target.value } : null)} 
                 onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                         promptState.resolve(promptState.value);
                         setPromptState(null);
                     }
                 }}
               />
               <div className="flex justify-end gap-3">
                 <Button variant="outline" onClick={() => { promptState.resolve(null); setPromptState(null); }}>Cancelar</Button>
                 <Button onClick={() => { promptState.resolve(promptState.value); setPromptState(null); }}>Guardar</Button>
               </div>
             </div>
           </ResponsiveModalContent>
         )}
      </ResponsiveModal>

      {/* DELETE CATEGORY WITH TRANSFER REALLOCATION MODAL */}
      <ResponsiveModal open={!!catDeleteState?.isOpen} onOpenChange={(open) => { if (!open && catDeleteState) { catDeleteState.resolve(false); setCatDeleteState(null); } }}>
         {catDeleteState && (
           <ResponsiveModalContent>
             <ResponsiveModalHeader>
               <ResponsiveModalTitle>Eliminar y Reasignar</ResponsiveModalTitle>
               <ResponsiveModalDescription>
                 La categoría "{catDeleteState.category.name}" tiene {catDeleteState.category.stats.uses} uso(s).
                 Selecciona una nueva categoría para mover estos registros antes de eliminarla permanentemente.
               </ResponsiveModalDescription>
             </ResponsiveModalHeader>
             <div className="mt-4 flex flex-col gap-4">
               <select 
                 className="w-full p-2 rounded-md border bg-background"
                 value={catDeleteState.targetId} 
                 onChange={(e) => setCatDeleteState(prev => prev ? { ...prev, targetId: e.target.value } : null)}
               >
                 <option value="" disabled>Selecciona una categoría destino...</option>
                 {categories
                     .filter(c => c.id !== catDeleteState.category.id && c.type === catDeleteState.category.type)
                     .sort((a, b) => a.name.localeCompare(b.name))
                     .map(c => (
                   <option key={c.id} value={c.id}>{c.group_name ? `${c.group_name} — ${c.name}` : c.name}</option>
                 ))}
               </select>
               <div className="flex justify-end gap-3">
                 <Button variant="outline" onClick={() => { catDeleteState.resolve(false); setCatDeleteState(null); }}>Cancelar</Button>
                 <Button 
                   disabled={!catDeleteState.targetId}
                   variant="destructive" 
                   onClick={async () => { 
                       if (catDeleteState.targetId === '' || !removeCategoryAndTransfer) return;
                       await removeCategoryAndTransfer(catDeleteState.category.id, catDeleteState.targetId);
                       catDeleteState.resolve(true); 
                       setCatDeleteState(null); 
                   }}
                 >
                   Reasignar y Eliminar
                 </Button>
               </div>
             </div>
           </ResponsiveModalContent>
         )}
      </ResponsiveModal>

    </DialogContext.Provider>
  );
}
