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
import { useAutoFoco } from '@/components/ui/autofocus';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { Picker } from '@/components/ui/picker';
import { parseAmount, formatMoney } from '@/lib/money';
import { AlertTriangle } from 'lucide-react';
import { AttachmentsField } from './attachments-field';
import type { TransactionType } from '@/lib/types';

/**
 * Los cinco tipos, en un solo selector.
 *
 * Aporte y retiro van al final y aclarados: no son resultado del negocio sino
 * plata de los socios, y esa distinción es la que evita que alguien cargue un
 * aporte como si fuera una venta.
 */
const TYPES = [
  { value: 'income' as const, label: 'Ingreso' },
  { value: 'expense' as const, label: 'Egreso' },
  { value: 'transfer' as const, label: 'Transferencia' },
  { value: 'contribution' as const, label: 'Aporte', hint: 'de un socio' },
  { value: 'withdrawal' as const, label: 'Retiro', hint: 'de un socio' },
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
  const attachFiles = useFinanceStore((s) => s.attachFiles);

  const isEdit = activeSheet === 'edit-transaction';
  const isOpen = activeSheet === 'new-transaction' || isEdit;
  const editing = isEdit ? (sheetData?.transaction as any) : null;

  const [type, setType] = useState<TransactionType>('expense');
  // En el teléfono no se enfoca solo: el teclado taparía el formulario
  // antes de que se llegue a ver.
  const autoFoco = useAutoFoco();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [periodMonth, setPeriodMonth] = useState('');
  const [partnerId, setPartnerId] = useState('');
  // Vacío = contado. Sólo se completa cuando la plata se mueve otro día.
  const [settlesAt, setSettlesAt] = useState('');
  const [reference, setReference] = useState('');
  /** Comprobantes elegidos para un movimiento que todavía no se guardó. */
  const [pendientes, setPendientes] = useState<File[]>([]);
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
    setPendientes([]);

    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amount ?? ''));
      setDescription(editing.description || '');
      setDate(editing.date ? editing.date.split('T')[0] : today());
      setAccountId(editing.account_id || '');
      setDestinationAccountId(editing.destination_account_id || '');
      setPeriodMonth(editing.period_month || '');
      setCategoryId(editing.category_id || '');
      setPartnerId(editing.partner_id || '');
      setSettlesAt(editing.settles_at ? editing.settles_at.split('T')[0] : '');
      setReference(editing.reference || '');
      setGroupName(
        categories.find((c) => c.id === editing.category_id)?.group_name || ''
      );
    } else {
      const d = sheetData ?? {};
      setType((d.type as TransactionType) || 'expense');
      setPartnerId((d.partner_id as string) || '');
      setSettlesAt('');
      setReference('');
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
  // Aporte y retiro: la plata es de un socio, no del negocio.
  const isEquity = type === 'contribution' || type === 'withdrawal';
  // Sólo un gasto o un ingreso pueden cobrarse o pagarse otro día: hay un
  // tercero de por medio. Lo demás mueve plata en el acto.
  const aplazable = type === 'income' || type === 'expense';

  const typeCategories = useMemo(
    () => (isTransfer || isEquity ? [] : categories.filter((c) => c.type === type)),
    [categories, type, isTransfer, isEquity]
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

  const partners = useFinanceStore((s) => s.partners);
  const partnerOptions = useMemo(
    () =>
      partners.map((p) => ({
        value: p.id,
        label: p.name,
        hint: p.ownership_pct > 0 ? `${p.ownership_pct}%` : undefined,
      })),
    [partners]
  );

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

  /**
   * Sólo las hojas.
   *
   * Una billetera con subcuentas agrupa y no recibe movimientos —la base lo
   * rechaza—, así que ofrecerla en el formulario sólo confunde: si el efectivo
   * está repartido en tres cajas, la que se elige es la caja.
   *
   * Se deriva de `parent_id` acá mismo y no de la marca `isGroup` que calcula
   * el store: así no depende de que ese cálculo haya corrido.
   */
  const sortedAccounts = useMemo(() => {
    const agrupa = new Set(accounts.map((a) => a.parent_id).filter(Boolean) as string[]);
    return accounts
      .filter((a) => !agrupa.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts]);

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

  // Las listas del formulario, ya con la moneda como texto secundario.
  // El nombre de la madre va como contexto: distingue "Efectivo › Caja fuerte"
  // de cualquier otra caja suelta que se llame parecido.
  const walletOptions = useMemo(() => {
    const nombrePadre = new Map(accounts.map((a) => [a.id, a.name]));
    return sortedAccounts
      .map((acc) => ({
        value: acc.id,
        label: acc.parent_id
          ? `${nombrePadre.get(acc.parent_id) ?? ''} › ${acc.name}`
          : acc.name,
        hint: currencies.find((c) => c.id === acc.currency_id)?.code,
      }));
  }, [sortedAccounts, accounts, currencies]);

  const groupOptions = useMemo(() => groups.map((g) => ({ value: g, label: g })), [groups]);

  const categoryOptions = useMemo(
    () => groupCategories.map((c) => ({ value: c.id, label: c.name })),
    [groupCategories]
  );

  // ---------------------------------------------------------------- guardar

  const handleSubmit = async () => {
    if (submitting) return;

    if (parsedAmount === null || parsedAmount <= 0) {
      return setError('Ingresá un monto mayor a cero.');
    }
    if (!account) return setError('Elegí una billetera.');
    if (isEquity && !partnerId) {
      return setError(type === 'contribution' ? 'Elegí quién aportó.' : 'Elegí quién retiró.');
    }
    if (isTransfer) {
      if (!destination) return setError('Elegí la billetera de destino.');
      if (destination.id === account.id) {
        return setError('El origen y el destino no pueden ser la misma billetera.');
      }
      if (currencyMismatch) {
        return setError('Todavía no se pueden transferir montos entre monedas distintas.');
      }
    } else if (!isEquity && !category) {
      return setError('Elegí una categoría.');
    }

    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        type,
        amount: parsedAmount,
        currency_id: account.currency_id,
        // Un aporte o un retiro no lleva categoría: el plan de categorías es
        // para resultados, y esto es patrimonio.
        category_id: isTransfer || isEquity ? null : category!.id,
        partner_id: isEquity ? partnerId : null,
        // Mediodía local, igual que `date`, para que no se corra un día.
        settles_at:
          aplazable && settlesAt ? new Date(`${settlesAt}T12:00:00`).toISOString() : null,
        // Mismo criterio que la fecha de pago: sólo donde hay un comprobante de
        // por medio. Una transferencia entre billeteras propias no tiene factura.
        reference: aplazable ? reference.trim() || null : null,
        account_id: account.id,
        destination_account_id: isTransfer ? destination!.id : null,
        description: description.trim() || defaultDescription(type),
        // Mediodía local, no medianoche: 'YYYY-MM-DD' con new Date() se lee como
        // medianoche UTC y en GMT-3 el movimiento caía un día antes.
        date: new Date(`${date}T12:00:00`).toISOString(),
        period_month: !isTransfer && !isEquity && isRecurring && periodMonth ? periodMonth : undefined,
      };

      if (isEdit && editing) {
        await updateTransaction(editing.id, payload);
      } else {
        const id = await addTransaction(payload);
        // Sin await: el modal cierra ya y los archivos terminan de subir con la
        // lista a la vista, marcados como "subiendo". `attachFiles` espera sola
        // a que el movimiento exista en la base.
        if (pendientes.length) void attachFiles(id, pendientes);
      }

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

        <ResponsiveModalBody className="space-y-2">
          <Field label="Tipo">
            <Picker
              value={type}
              onValueChange={(v) => {
                const nuevo = v as TransactionType;
                setType(nuevo);
                // Cada tipo usa campos distintos: lo que deja de aplicar se
                // limpia, para no guardar un destino o una categoría de un
                // tipo anterior.
                if (nuevo !== 'transfer') setDestinationAccountId('');
                if (nuevo === 'transfer' || nuevo === 'contribution' || nuevo === 'withdrawal') {
                  setCategoryId('');
                }
                if (nuevo !== 'contribution' && nuevo !== 'withdrawal') setPartnerId('');
                if (nuevo !== 'income' && nuevo !== 'expense') setSettlesAt('');
              }}
              options={TYPES}
              searchable={false}
            />
          </Field>

          <Field label="Fecha" htmlFor="tx-fecha" hint="cuándo pasó">
            <Input
              id="tx-fecha"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          {/* La segunda fecha: la del cheque o el pago a plazo.
              Sólo donde tiene sentido. Un gasto se paga y un ingreso se cobra,
              y las dos cosas pueden caer otro día. Una transferencia entre
              billeteras propias, un aporte y un retiro no: esa plata se mueve
              cuando se mueve, no hay un tercero que la difiera. */}
          {aplazable && (
            <Field
              label={type === 'income' ? 'Se cobra' : 'Se paga'}
              htmlFor="tx-pago"
              hint={
                settlesAt ? (
                  <button
                    type="button"
                    onClick={() => setSettlesAt('')}
                    className="font-medium text-primary hover:underline"
                  >
                    contado
                  </button>
                ) : (
                  'contado'
                )
              }
            >
              {/* Sin `min`: pagar por adelantado existe. En los datos hay un
                  servicio de mayo pagado en marzo por $666.000. Poner el pago
                  siempre después del hecho bloquearía un caso real. */}
              <Input
                id="tx-pago"
                type="date"
                value={settlesAt}
                onChange={(e) => setSettlesAt(e.target.value)}
              />
            </Field>
          )}

          {isEquity && (
            <Field
              label={type === 'contribution' ? 'Aporta' : 'Retira'}
              error={partners.length === 0 ? 'Todavía no cargaste socios.' : null}
            >
              <Picker
                value={partnerId}
                onValueChange={setPartnerId}
                options={partnerOptions}
                placeholder="Elegir socio"
                emptyMessage="No hay socios cargados"
              />
            </Field>
          )}

          {!isTransfer && !isEquity && (
            <>
              <Field label="Macrogrupo">
                <Picker
                  value={group}
                  onValueChange={(v) => {
                    setGroupName(v);
                    setCategoryId(''); // el grupo cambió: la categoría anterior ya no aplica
                    setPeriodMonth('');
                  }}
                  options={groupOptions}
                  placeholder="Sin grupos"
                />
              </Field>

              <Field label="Categoría">
                <Picker
                  value={category?.id}
                  onValueChange={setCategoryId}
                  options={categoryOptions}
                  placeholder="Elegir"
                />
              </Field>
            </>
          )}

          <Field label={isTransfer ? 'Desde' : 'Billetera'}>
            <Picker
              value={account?.id}
              onValueChange={setAccountId}
              options={walletOptions}
              placeholder="Elegir billetera"
            />
          </Field>

          {isTransfer && (
            <Field label="Hasta">
              <Picker
                value={destination?.id}
                onValueChange={setDestinationAccountId}
                options={walletOptions.filter((o) => o.value !== account?.id)}
                placeholder="Elegir billetera"
              />
            </Field>
          )}

          {isRecurring && !isTransfer && !isEquity && (
            <Field label="Período" htmlFor="tx-periodo">
              <Input
                id="tx-periodo"
                type="month"
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
              />
            </Field>
          )}

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
              autoFocus={autoFoco}
            />
          </Field>

          <Field label="Descripción" htmlFor="tx-desc">
            <Textarea
              id="tx-desc"
              placeholder={isTransfer ? 'Motivo' : '¿En qué fue?'}
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

          {aplazable && (
            <Field label="Referencia" hint="opcional" htmlFor="tx-ref">
              <Input
                id="tx-ref"
                placeholder="FC 1083"
                autoComplete="off"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
          )}

          {/* En todos los tipos: una transferencia también tiene su captura. */}
          {isEdit && editing ? (
            <AttachmentsField transactionId={editing.id} />
          ) : (
            <AttachmentsField pendientes={pendientes} onPendientesChange={setPendientes} />
          )}

          {isEquity && (
            <p className="px-1 text-xs text-muted-foreground">
              {type === 'contribution'
                ? 'Un aporte suma a la caja pero no es un ingreso del negocio: no entra al resultado del mes.'
                : 'Un retiro saca plata de la caja pero no es un gasto del negocio: no entra al resultado del mes.'}
            </p>
          )}

          {isTransfer && currencyMismatch && (
            <p className="flex items-start gap-1.5 rounded-xl bg-warning/10 p-2.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Son monedas distintas. Todavía no se puede convertir en la transferencia:
              registralo como un gasto y un ingreso por separado.
            </p>
          )}

          {groups.length === 0 && !isTransfer && !isEquity && (
            <p className="px-1 text-xs text-muted-foreground">
              No tenés categorías de {type === 'income' ? 'ingreso' : 'gasto'}. Creá una desde
              Categorías.
            </p>
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
  const etiquetas: Record<TransactionType, string> = {
    income: 'Ingreso',
    expense: 'Gasto',
    transfer: 'Transferencia',
    contribution: 'Aporte',
    withdrawal: 'Retiro',
  };
  return etiquetas[type] ?? 'Movimiento';
}
