'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldRow } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { parseAmount, formatMoney } from '@/lib/money';
import { TrendingUp, TrendingDown, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import type { TransactionType } from '@/lib/types';

const TYPES = [
  { value: 'income' as const, label: 'Ingreso', icon: TrendingUp, active: 'border-income bg-income/10 text-income' },
  { value: 'expense' as const, label: 'Gasto', icon: TrendingDown, active: 'border-expense bg-expense/10 text-expense' },
  { value: 'transfer' as const, label: 'Transferencia', icon: ArrowLeftRight, active: 'border-transfer bg-transfer/10 text-transfer' },
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function TransactionForm() {
  const activeSheet = useUIStore((s) => s.activeSheet);
  const sheetData = useUIStore((s) => s.sheetData);
  const closeSheet = useUIStore((s) => s.closeSheet);

  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const currencies = useFinanceStore((s) => s.currencies);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);

  const isEdit = activeSheet === 'edit-transaction';
  const isOpen = activeSheet === 'new-transaction' || isEdit;
  const editing = isEdit ? (sheetData?.transaction as any) : null;

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [periodMonth, setPeriodMonth] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Inicialización.
   *
   * La clave es qué NO está en las dependencias. Antes acá estaban `categories`
   * y `sheetData`: cualquier `hydrate()` con el modal abierto —o simplemente un
   * render nuevo del store— reconstruía esos objetos y el formulario se
   * reseteaba borrando lo que el usuario venía escribiendo.
   *
   * Ahora se dispara sólo al abrir, y se identifica el movimiento por su id.
   */
  const initedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) {
      initedFor.current = null;
      return;
    }

    const key = editing?.id ?? 'new';
    if (initedFor.current === key) return;
    initedFor.current = key;

    setError(null);
    setSubmitting(false);

    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amount ?? ''));
      setDescription(editing.description || '');
      setDate(editing.date ? editing.date.split('T')[0] : today());
      setAccountId(editing.account_id || '');
      setDestinationAccountId(editing.destination_account_id || '');
      setPeriodMonth(editing.period_month || '');
      setCategoryId(editing.category_id || '');
      setGroupName(
        categories.find((c) => c.id === editing.category_id)?.group_name || ''
      );
    } else {
      const d = sheetData ?? {};
      setType((d.type as TransactionType) || 'expense');
      setAmount(d.amount != null ? String(d.amount) : '');
      setDescription((d.description as string) || '');
      setDate((d.date as string) || today());
      setPeriodMonth((d.periodMonth as string) || '');
      setCategoryId((d.categoryId as string) || '');
      setGroupName((d.groupName as string) || '');
      setDestinationAccountId('');
      setAccountId('');
    }
  }, [isOpen, editing, sheetData, categories]);

  // ---------------------------------------------------------------- derivado
  //
  // Nada de sincronizar estado con efectos: se DERIVA en cada render. Antes,
  // al pasar de Ingreso a Gasto el grupo guardado seguía siendo uno de ingresos
  // —el Select lo mostraba tal cual— y la lista de categorías quedaba vacía.
  // Derivando, un valor que dejó de ser válido simplemente deja de usarse.

  const isTransfer = type === 'transfer';

  const typeCategories = useMemo(
    () => (isTransfer ? [] : categories.filter((c) => c.type === type)),
    [categories, type, isTransfer]
  );

  const groups = useMemo(
    () =>
      Array.from(new Set(typeCategories.map((c) => c.group_name || 'General'))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [typeCategories]
  );

  /** El grupo elegido, o el primero disponible si el guardado ya no aplica. */
  const group = groups.includes(groupName) ? groupName : (groups[0] ?? '');

  const groupCategories = useMemo(
    () =>
      typeCategories
        .filter((c) => (c.group_name || 'General') === group)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [typeCategories, group]
  );

  /** La categoría elegida sólo si sigue perteneciendo al grupo vigente. */
  const category = groupCategories.find((c) => c.id === categoryId) ?? null;
  const isRecurring = category?.is_recurring ?? false;

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => a.name.localeCompare(b.name)),
    [accounts]
  );

  /** La primera billetera es un valor por defecto, no una elección del usuario. */
  const account =
    sortedAccounts.find((a) => a.id === accountId) ?? (isEdit ? null : sortedAccounts[0] ?? null);
  const destination = sortedAccounts.find((a) => a.id === destinationAccountId) ?? null;

  const currency = currencies.find((c) => c.id === account?.currency_id) || currencies[0];
  const parsedAmount = parseAmount(amount);

  // Transferir entre monedas distintas necesita una cotización que el formulario
  // todavía no pide, así que se avisa en vez de guardar algo incorrecto.
  const currencyMismatch =
    isTransfer && !!destination && !!account && destination.currency_id !== account.currency_id;

  // ---------------------------------------------------------------- guardar

  const handleSubmit = async () => {
    if (submitting) return;

    if (parsedAmount === null || parsedAmount <= 0) {
      return setError('Ingresá un monto mayor a cero.');
    }
    if (!account) return setError('Elegí una billetera.');
    if (isTransfer) {
      if (!destination) return setError('Elegí la billetera de destino.');
      if (destination.id === account.id) {
        return setError('El origen y el destino no pueden ser la misma billetera.');
      }
      if (currencyMismatch) {
        return setError('Todavía no se pueden transferir montos entre monedas distintas.');
      }
    } else if (!category) {
      return setError('Elegí una categoría.');
    }

    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        type,
        amount: parsedAmount,
        currency_id: account.currency_id,
        category_id: isTransfer ? null : category!.id,
        account_id: account.id,
        destination_account_id: isTransfer ? destination!.id : null,
        description: description.trim() || defaultDescription(type),
        // Mediodía local, no medianoche: 'YYYY-MM-DD' con new Date() se lee como
        // medianoche UTC y en GMT-3 el movimiento caía un día antes.
        date: new Date(`${date}T12:00:00`).toISOString(),
        period_month: !isTransfer && isRecurring && periodMonth ? periodMonth : undefined,
      };

      if (isEdit && editing) await updateTransaction(editing.id, payload);
      else await addTransaction(payload);

      closeSheet();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar el movimiento.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>
            {isEdit ? 'Editar movimiento' : 'Nuevo movimiento'}
          </ResponsiveModalTitle>
        </ResponsiveModalHeader>

        <ResponsiveModalBody className="space-y-3">
          {/* Tipo. El activo se distingue por borde, fondo, color y peso. */}
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de movimiento">
            {TYPES.map((opt) => {
              const selected = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setType(opt.value);
                    // Al salir de transferencia el destino deja de tener sentido.
                    if (opt.value !== 'transfer') setDestinationAccountId('');
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border-2 px-2 py-2 transition-all',
                    selected
                      ? opt.active
                      : 'border-transparent bg-muted text-muted-foreground hover:bg-accent'
                  )}
                >
                  <opt.icon className="size-4 shrink-0" />
                  <span className={cn('truncate text-xs', selected ? 'font-semibold' : 'font-medium')}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>

          <FieldRow>
            {/* Monto. Texto y no number: un input numérico rechaza la coma, así
                que "1.234,56" quedaba vacío. Se parsea con parseAmount. */}
            <Field
              label="Monto"
              htmlFor="tx-monto"
              hint={
                parsedAmount !== null && parsedAmount > 0
                  ? formatMoney(parsedAmount, currency)
                  : currency?.code
              }
            >
              <Input
                id="tx-monto"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="font-semibold tabular-nums"
                autoFocus
              />
            </Field>

            <Field
              label="Fecha"
              htmlFor="tx-fecha"
              hint={
                date !== today() ? (
                  <button
                    type="button"
                    onClick={() => setDate(today())}
                    className="font-medium text-primary hover:underline"
                  >
                    Hoy
                  </button>
                ) : null
              }
            >
              <Input
                id="tx-fecha"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </FieldRow>

          <Field label="Descripción" htmlFor="tx-desc">
            <Textarea
              id="tx-desc"
              placeholder={isTransfer ? 'Motivo de la transferencia' : '¿En qué fue?'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              // Enter hace salto de línea; se guarda con Ctrl/Cmd + Enter.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              maxRows={4}
            />
          </Field>

          {isTransfer ? (
            <FieldRow>
              <Field label="Billetera de origen">
                <Select value={account?.id ?? ''} onValueChange={(v) => v && setAccountId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elegir" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {`${acc.name} (${currencies.find((c) => c.id === acc.currency_id)?.code})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Billetera de destino">
                <Select
                  value={destination?.id ?? ''}
                  onValueChange={(v) => v && setDestinationAccountId(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Elegir" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedAccounts
                      .filter((a) => a.id !== account?.id)
                      .map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {`${acc.name} (${currencies.find((c) => c.id === acc.currency_id)?.code})`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldRow>
          ) : (
            <Field label="Billetera">
              <Select value={account?.id ?? ''} onValueChange={(v) => v && setAccountId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegir billetera" />
                </SelectTrigger>
                <SelectContent>
                  {sortedAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {`${acc.name} (${currencies.find((c) => c.id === acc.currency_id)?.code})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {isTransfer && currencyMismatch && (
            <p className="flex items-start gap-1.5 rounded-xl bg-warning/10 p-2.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Son monedas distintas. Todavía no se puede convertir en la transferencia:
              registralo como un gasto y un ingreso por separado.
            </p>
          )}

          {!isTransfer && (
            <>
              <FieldRow>
                <Field label="Macrogrupo">
                  <Select
                    value={group}
                    onValueChange={(v) => {
                      if (!v) return;
                      setGroupName(v);
                      setCategoryId(''); // el grupo cambió: la categoría anterior ya no aplica
                      setPeriodMonth('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin grupos" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Categoría">
                  <Select value={category?.id ?? ''} onValueChange={(v) => v && setCategoryId(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegir" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldRow>

              {groups.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  No tenés categorías de {type === 'income' ? 'ingreso' : 'gasto'}. Creá una desde
                  Categorías.
                </p>
              )}

              {isRecurring && (
                <Field label="Período de facturación" htmlFor="tx-periodo">
                  <Input
                    id="tx-periodo"
                    type="month"
                    value={periodMonth}
                    onChange={(e) => setPeriodMonth(e.target.value)}
                  />
                </Field>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </ResponsiveModalBody>

        <ResponsiveModalFooter>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar movimiento'}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function defaultDescription(type: TransactionType): string {
  return type === 'income' ? 'Ingreso' : type === 'expense' ? 'Gasto' : 'Transferencia';
}
