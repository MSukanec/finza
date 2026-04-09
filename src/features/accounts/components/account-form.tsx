'use client';

import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
import { ResponsiveModal, ResponsiveModalContent, ResponsiveModalHeader, ResponsiveModalTitle } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Trash2, AlertTriangle, ArrowRight } from 'lucide-react';

export function AccountForm() {
  const activeSheet = useUIStore((s) => s.activeSheet);
  const sheetData = useUIStore((s) => s.sheetData);
  const closeSheet = useUIStore((s) => s.closeSheet);

  const currencies = useFinanceStore((s) => s.currencies);
  const addAccount = useFinanceStore((s) => s.addAccount);
  const updateAccount = useFinanceStore((s) => s.updateAccount);

  const isEdit = activeSheet === 'edit-account';
  const isOpen = activeSheet === 'new-account' || isEdit;

  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [currencyId, setCurrencyId] = useState('ars');
  const [initialBalance, setInitialBalance] = useState('');

  const [deleteMode, setDeleteMode] = useState<'idle' | 'loading' | 'empty' | 'has_txs'>('idle');
  const [txCount, setTxCount] = useState(0);
  const [replacementWalletId, setReplacementWalletId] = useState('');

  const accounts = useFinanceStore((s) => s.accounts);
  const compatibleAccounts = [...accounts]
      .filter(a => 
          a.id !== (sheetData?.account as any)?.id && 
          a.currency_id === currencyId
      )
      .sort((a,b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (isOpen) {
       const acc = sheetData?.account as any;
       if (isEdit && acc) {
          setName(acc.name);
          setType(acc.type);
          setCurrencyId(acc.currency_id);
          setInitialBalance(acc.initial_balance?.toString() || '0');
       } else {
          setName('');
          setType('bank');
          setCurrencyId('ars');
          setInitialBalance('0');
        }
        setDeleteMode('idle');
        setReplacementWalletId('');
    }
  }, [isOpen, isEdit, sheetData]);

  const initiateDelete = async () => {
     setDeleteMode('loading');
     const acc = sheetData?.account as any;
     const { count } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('wallet_id', acc.id);
     
     if ((count || 0) > 0) {
         setTxCount(count || 0);
         setDeleteMode('has_txs');
         if (compatibleAccounts.length > 0) {
             setReplacementWalletId(compatibleAccounts[0].id);
         }
     } else {
         setDeleteMode('empty');
     }
  };

  const executeDelete = async () => {
      const acc = sheetData?.account as any;
      if (!acc) return;
      
      try {
          if (deleteMode === 'has_txs') {
              if (!replacementWalletId) return alert('Debes elegir una cuenta de reemplazo.');
              await supabase.from('transactions').update({ wallet_id: replacementWalletId }).eq('wallet_id', acc.id);
          }
          await supabase.from('wallets').delete().eq('id', acc.id);
          
          await useFinanceStore.getState().hydrate();
          closeSheet();
      } catch(e: any) {
          alert('Error eliminando la cuenta: ' + e.message);
      }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;

    try {
      const acc = sheetData?.account as any;
      const parsedBalance = parseFloat(initialBalance) || 0;
      if (isEdit && acc) {
         await updateAccount(acc.id, {
            name: name.trim(),
            type: type as any,
            currency_id: currencyId,
            initial_balance: parsedBalance
         });
      } else {
         await addAccount({
            name: name.trim(),
            type,
            currency_id: currencyId,
            initial_balance: parsedBalance
         });
      }
      closeSheet();
    } catch (e: any) {
      alert("Hubo un error guardando en Supabase: " + (e.message || JSON.stringify(e)));
    }
  };

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle className="text-xl sm:text-lg text-center sm:text-left">
            {isEdit ? 'Editar Cuenta' : 'Nueva Cuenta'}
          </ResponsiveModalTitle>
        </ResponsiveModalHeader>

        {deleteMode === 'idle' && (
        <div className="space-y-6 pb-6 mt-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Nombre de la cuenta</Label>
            <Input
              placeholder="Ej: Banco Galicia, Billetera Mágica..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-accent/30 border-border/50"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Tipo de Cuenta</Label>
            <Select value={type} onValueChange={(v) => v && setType(v)}>
              <SelectTrigger className="h-12 bg-accent/30 border-border/50 text-base">
                <SelectValue>
                  {type === 'bank' ? 'Banco Tradicional' : type === 'cash' ? 'Efectivo' : type === 'digital' ? 'Billetera Digital / Crypto' : 'Seleccionar tipo'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="bank">Banco Tradicional</SelectItem>
                <SelectItem value="digital">Billetera Digital / Crypto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Moneda Principal</Label>
            <Select value={currencyId} onValueChange={(v) => v && setCurrencyId(v)}>
              <SelectTrigger className="h-12 bg-accent/30 border-border/50 text-base">
                <SelectValue placeholder="Seleccionar moneda" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Saldo Inicial / Activo Base</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="bg-accent/30 border-border/50"
            />
          </div>

          <div className="flex gap-2 mt-4">
              {isEdit && (
                  <Button
                    variant="outline"
                    onClick={initiateDelete}
                    className="h-12 w-12 shrink-0 text-destructive border-border/50 hover:bg-destructive/10 hover:border-destructive/30"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
              )}
              <Button
                onClick={handleSubmit}
                disabled={!name.trim()}
                className="w-full h-12 text-base font-semibold"
              >
                {isEdit ? 'Guardar Cambios' : 'Crear Cuenta'}
              </Button>
          </div>
        </div>
        )}

        {deleteMode === 'loading' && (
           <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">Analizando dependencias contables...</p>
           </div>
        )}

        {deleteMode === 'empty' && (
           <div className="py-4 space-y-6 animate-in fade-in zoom-in-95">
              <div className="bg-destructive/10 text-destructive p-4 rounded-xl flex items-start gap-3 border border-destructive/20">
                 <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                 <div className="space-y-1">
                    <p className="font-semibold text-sm">Eliminación Segura</p>
                    <p className="text-xs opacity-90">No encontramos ningún movimiento asociado a esta cuenta. Puedes eliminarla con total seguridad.</p>
                 </div>
              </div>
              <div className="flex gap-3">
                 <Button variant="outline" className="w-full" onClick={() => setDeleteMode('idle')}>Cancelar</Button>
                 <Button variant="destructive" className="w-full" onClick={executeDelete}>Eliminar Cuenta</Button>
              </div>
           </div>
        )}

        {deleteMode === 'has_txs' && (
           <div className="py-4 space-y-6 animate-in fade-in zoom-in-95">
              <div className="bg-warning/10 text-warning-foreground p-4 rounded-xl flex items-start gap-3 border border-warning/20">
                 <AlertTriangle className="w-5 h-5 shrink-0 text-warning mt-0.5" />
                 <div className="space-y-1">
                    <p className="font-semibold text-sm">Atención: {txCount} movimientos</p>
                    <p className="text-xs opacity-90">Para proteger tu contabilidad (y evitar pérdida de datos), debes reasignar el historial de esta cuenta hacia otra billetera en <strong>{currencies.find(c => c.id === currencyId)?.code || 'tu moneda elegida'}</strong>.</p>
                 </div>
              </div>

              <div className="space-y-3 p-4 bg-accent/20 rounded-xl border border-border/50">
                 <div className="flex items-center gap-3 text-muted-foreground justify-center">
                    <span className="font-semibold text-sm px-3 py-1 bg-background rounded-md shadow-sm border">{name}</span>
                    <ArrowRight className="w-4 h-4" />
                    <span className="font-semibold text-sm px-3 py-1 bg-primary/10 text-primary rounded-md border border-primary/20">¿Nueva Cuenta?</span>
                 </div>
                 
                 <div className="pt-2">
                    <Label className="text-xs text-muted-foreground mb-1 block">Cuenta de destino</Label>
                    <Select value={replacementWalletId} onValueChange={(val) => val && setReplacementWalletId(val)}>
                      <SelectTrigger className="bg-background border-border/50">
                        <SelectValue placeholder="Elegí a dónde mover los datos" />
                      </SelectTrigger>
                      <SelectContent>
                        {compatibleAccounts.length === 0 && (
                            <SelectItem value="none" disabled>
                                No tienes otras cuentas en la misma moneda.
                            </SelectItem>
                        )}
                        {compatibleAccounts.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                 </div>
              </div>

              <div className="flex gap-3 pt-2">
                 <Button variant="outline" className="w-full" onClick={() => setDeleteMode('idle')}>Atrás</Button>
                 <Button variant="destructive" className="w-full" disabled={!replacementWalletId || replacementWalletId === 'none'} onClick={executeDelete}>
                    Migrar y Eliminar
                 </Button>
              </div>
           </div>
        )}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
