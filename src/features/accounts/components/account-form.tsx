'use client';

import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
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
import { useAutoFoco } from '@/components/ui/autofocus';
import { Field } from '@/components/ui/field';
import { Picker } from '@/components/ui/picker';

const TIPOS_DE_CUENTA = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'bank', label: 'Banco tradicional' },
  { value: 'digital', label: 'Billetera digital / Crypto' },
];
import { useState, useEffect } from 'react';
import { parseAmount } from '@/lib/money';
import { Scale } from 'lucide-react';

export function AccountForm() {
  const activeSheet = useUIStore((s) => s.activeSheet);
  const sheetData = useUIStore((s) => s.sheetData);
  const closeSheet = useUIStore((s) => s.closeSheet);
  const openSheet = useUIStore((s) => s.openSheet);

  const currencies = useFinanceStore((s) => s.currencies);
  const addAccount = useFinanceStore((s) => s.addAccount);
  const updateAccount = useFinanceStore((s) => s.updateAccount);

  const isEdit = activeSheet === 'edit-account';
  const isOpen = activeSheet === 'new-account' || isEdit;

  const [name, setName] = useState('');
  // En el teléfono no se enfoca solo: el teclado taparía el formulario
  // antes de que se llegue a ver.
  const autoFoco = useAutoFoco();
  const [type, setType] = useState('bank');
  const [currencyId, setCurrencyId] = useState('ars');
  const [initialBalance, setInitialBalance] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accounts = useFinanceStore((s) => s.accounts);

  useEffect(() => {
    if (isOpen) {
       const acc = sheetData?.account as any;
       if (isEdit && acc) {
          setName(acc.name);
          setType(acc.type);
          setCurrencyId(acc.currency_id);
          // Un saldo en cero se muestra vacío, con el placeholder. Antes escribía
          // un "0" literal en el campo, que había que borrar para escribir encima.
          setInitialBalance(acc.initial_balance ? String(acc.initial_balance) : '');
       } else {
          setName('');
          setType('bank');
          setCurrencyId('ars');
          setInitialBalance('');
        }
        setError(null);
        setSubmitting(false);
    }
  }, [isOpen, isEdit, sheetData]);



  const handleSubmit = async () => {
    if (submitting) return;
    if (!name.trim()) return setError('Poné un nombre para la billetera.');
    if (!currencyId) return setError('Elegí una moneda.');

    setError(null);
    setSubmitting(true);
    try {
      const acc = sheetData?.account as any;
      // parseFloat no entiende el formato local: "1.234,56" daba 1.
      const parsedBalance = parseAmount(initialBalance) ?? 0;
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
      setError(e?.message || 'No se pudo guardar la billetera.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>
            {isEdit ? 'Editar billetera' : 'Nueva billetera'}
          </ResponsiveModalTitle>
        </ResponsiveModalHeader>

        <ResponsiveModalBody className="space-y-3">
          <Field label="Nombre" htmlFor="acc-nombre">
            <Input
              id="acc-nombre"
              placeholder="Ej: Banco Galicia, Billetera Mágica…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={autoFoco}
            />
          </Field>

            <Field label="Tipo de cuenta">
              <Picker
                value={type}
                onValueChange={setType}
                options={TIPOS_DE_CUENTA}
                placeholder="Elegir tipo"
              />
            </Field>

            <Field label="Moneda principal">
              <Picker
                value={currencyId}
                onValueChange={setCurrencyId}
                options={currencies.map((c) => ({ value: c.id, label: c.name, hint: c.code }))}
                placeholder="Elegir moneda"
              />
            </Field>

          <Field
            label="Saldo inicial"
            hint={isEdit ? 'punto de partida' : 'lo que hay hoy'}
            htmlFor="acc-saldo"
          >
            <Input
              id="acc-saldo"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="tabular-nums"
            />
          </Field>

          {/* Los dos actos son distintos y la interfaz tiene que decirlo: el
              saldo inicial es el punto de partida, el arqueo es cuánto hay hoy.
              Ajustar el inicial para "cuadrar" reescribe la historia. */}
          {isEdit ? (
            <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              Este es el punto de partida de la billetera, no lo que hay hoy. Cambialo sólo si te
              equivocaste al cargarlo: modificarlo recalcula todo el historial.
              <button
                type="button"
                onClick={() => {
                  const id = (sheetData?.account as any)?.id;
                  closeSheet();
                  if (id) setTimeout(() => openSheet('reconcile-wallet', { walletId: id }), 0);
                }}
                className="mt-2 flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                <Scale className="size-3.5" />
                Para registrar cuánto hay hoy, hacé un arqueo
              </button>
            </div>
          ) : (
            <p className="px-1 text-xs text-muted-foreground">
              Poné la plata que hay en esta billetera hoy. Es el punto de partida: de acá en
              adelante el saldo lo calculan los movimientos.
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </ResponsiveModalBody>

        <ResponsiveModalFooter>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear billetera'}
          </Button>
        </ResponsiveModalFooter>

      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
