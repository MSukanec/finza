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
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { parseAmount } from '@/lib/money';
import { Picker } from '@/components/ui/picker';
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

    // El campo es texto para aceptar "1.234,56": Number() devolveria NaN.
    const total = parseAmount(totalAmount);
    if (total === null || total <= 0) {
      setError('Ingresá un total mayor a cero.');
      return;
    }

    const payload = {
      name,
      description,
      total_amount: total,
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
        <ResponsiveModalBody className="space-y-3">
          <Field label="Nombre" htmlFor="deuda-nombre">
            <Input
              id="deuda-nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Préstamo auto, Tarjeta Galicia…"
              required
            />
          </Field>

            <Field label="Total adeudado" htmlFor="deuda-total">
              <Input
                id="deuda-total"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                className="tabular-nums"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                required
              />
            </Field>

            <Field label="Moneda">
              <Picker
                value={currencyCode}
                onValueChange={setCurrencyCode}
                options={currencies.map((c) => ({ value: c.id.toUpperCase(), label: c.code }))}
                placeholder="Elegir"
                disabled={isEdit}
              />
            </Field>

          <Field label="Detalle" htmlFor="deuda-detalle">
            <Textarea
              id="deuda-detalle"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Plazo, tasa de interés, entidad…"
              maxRows={4}
            />
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </ResponsiveModalBody>

        {/* Eliminar y cancelar van en el cuerpo: el footer es UN botón, el de
            la acción principal. Metidos adentro, el <div> que los envolvía
            pasaba a ser "el botón" y los tres quedaban apretados en una fila
            de 56px. */}
        {isEdit && (
          <div className="shrink-0 border-t border-border/60 px-4 py-2">
            <button
              type="button"
              onClick={handleDelete}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl p-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
              Eliminar deuda
            </button>
          </div>
        )}

        <ResponsiveModalFooter>
          <Button type="submit">{isEdit ? 'Actualizar' : 'Crear'}</Button>
        </ResponsiveModalFooter>
        </form>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
