'use client';

import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';

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

  useEffect(() => {
    if (isOpen) {
       const acc = sheetData?.account as any;
       if (isEdit && acc) {
          setName(acc.name);
          setType(acc.type);
          setCurrencyId(acc.currency_id);
       } else {
          setName('');
          setType('bank');
          setCurrencyId('ars');
       }
    }
  }, [isOpen, isEdit, sheetData]);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    try {
      const acc = sheetData?.account as any;
      if (isEdit && acc) {
         await updateAccount(acc.id, {
            name: name.trim(),
            type: type as any,
            currency_id: currencyId,
         });
      } else {
         await addAccount({
            name: name.trim(),
            type,
            currency_id: currencyId,
         });
      }
      closeSheet();
    } catch (e: any) {
      alert("Hubo un error guardando en Supabase: " + (e.message || JSON.stringify(e)));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md p-6">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-lg text-center sm:text-left">
            {isEdit ? 'Editar Cuenta' : 'Nueva Cuenta'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pb-6">
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
              <SelectTrigger className="bg-accent/30 border-border/50">
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
              <SelectTrigger className="bg-accent/30 border-border/50">
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

          <Button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="w-full h-12 text-base font-semibold mt-4"
          >
            {isEdit ? 'Guardar Cambios' : 'Crear Cuenta'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
