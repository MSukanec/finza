'use client';

import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';

export function AccountForm() {
  const activeSheet = useUIStore((s) => s.activeSheet);
  const closeSheet = useUIStore((s) => s.closeSheet);

  const currencies = useFinanceStore((s) => s.currencies);
  const addAccount = useFinanceStore((s) => s.addAccount);

  const isOpen = activeSheet === 'new-account';

  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [currencyId, setCurrencyId] = useState('ars');

  const handleSubmit = async () => {
    if (!name.trim()) return;

    await addAccount({
      name: name.trim(),
      type,
      currency_id: currencyId,
    });

    setName('');
    setType('bank');
    setCurrencyId('ars');
    closeSheet();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg">Nueva Cuenta</SheetTitle>
        </SheetHeader>

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
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="bank">Banco / Billetera Virtual</SelectItem>
                <SelectItem value="savings">Ahorros</SelectItem>
                <SelectItem value="credit">Tarjeta de Crédito</SelectItem>
                <SelectItem value="investment">Inversión / Crypto</SelectItem>
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
            Crear Cuenta
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
