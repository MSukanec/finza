'use client';

import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
import { useGlobalDialog } from '@/components/providers/dialog-provider';
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalBody,
  ResponsiveModalFooter,
} from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';

export function DebtForm() {
  const activeSheet = useUIStore((s) => s.activeSheet);
  const sheetData = useUIStore((s) => s.sheetData);
  const closeSheet = useUIStore((s) => s.closeSheet);

  const currencies = useFinanceStore((s) => s.currencies);
  const addDebt = useFinanceStore((s) => s.addDebt);
  const updateDebt = useFinanceStore((s) => s.updateDebt);
  const removeDebt = useFinanceStore((s) => s.removeDebt);

  const isEdit = activeSheet === 'edit-debt';
  const isOpen = activeSheet === 'new-debt' || isEdit;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currencyCode, setCurrencyCode] = useState('ARS');
  const [totalAmount, setTotalAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dialog = useGlobalDialog();

  useEffect(() => {
    if (isOpen) {
       const d = sheetData?.debt as any;
       if (isEdit && d) {
          setName(d.category_name || '');
          setDescription(d.description || '');
          setCurrencyCode(d.currency_code || 'ARS');
          setTotalAmount(d.total_amount?.toString() || '0');
       } else {
          setName('');
          setDescription('');
          setCurrencyCode('ARS');
          setTotalAmount('');
       }
    }
  }, [isOpen, isEdit, sheetData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !totalAmount) return;

    const payload = {
      name,
      description,
      total_amount: Number(totalAmount),
      currency_code: currencyCode,
    };

    // Las escrituras del store son optimistas: vuelven apenas aplican el cambio
    // en memoria, asi que el modal cierra sin esperar a la red. Si el servidor
    // rechaza algo, el store lo deshace y avisa.
    try {
      if (isEdit) await updateDebt((sheetData?.debt as any).id, payload);
      else await addDebt(payload);
      closeSheet();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la deuda.');
    }
  };

  const handleDelete = async () => {
    const ok = await dialog.confirm(
      'Eliminar deuda',
      'Se elimina la deuda y su categoría, pero no los movimientos de pago ya registrados.'
    );
    if (!ok) return;
    await removeDebt((sheetData?.debt as any).id);
    closeSheet();
  };

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(o) => !o && closeSheet()}>
      <ResponsiveModalContent className="sm:max-w-[425px]">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{isEdit ? 'Editar Deuda' : 'Nueva Deuda'}</ResponsiveModalTitle>
        </ResponsiveModalHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <ResponsiveModalBody className="space-y-5">
          <div className="space-y-2">
            <Label>Nombre (Reflejado como Subcategoría)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Préstamo Auto, Tarjeta Galicia, etc"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Moneda de la Deuda</Label>
            <Select value={currencyCode} onValueChange={(val) => { if (val) setCurrencyCode(val) }} disabled={isEdit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map(c => (
                  <SelectItem key={c.id} value={c.id.toUpperCase()}>{c.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Total Inicial Adeudado</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                className="pl-7 tabular-nums"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">Monto fijo inamovible (Ej: 10,000).</p>
          </div>

          <div className="space-y-2">
            <Label>Descripción Adicional</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Plazo, tasa de interés, entidad, etc"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

        </ResponsiveModalBody>

        <ResponsiveModalFooter>
          <div className="flex items-center justify-between">
            {isEdit ? (
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={handleDelete}>
                   <Trash2 className="size-4" />
                </Button>
            ) : <div/>}

            <div className="flex gap-2">
                <Button type="button" variant="outline" className="w-full" onClick={closeSheet}>
                Cancelar
                </Button>
                <Button type="submit" className="w-full">
                {isEdit ? 'Actualizar' : 'Crear'}
                </Button>
            </div>
          </div>
        </ResponsiveModalFooter>
        </form>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
