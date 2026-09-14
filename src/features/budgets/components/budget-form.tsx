'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Picker } from '@/components/ui/picker';
import { Plus, Trash2 } from 'lucide-react';
import type { Budget } from '@/lib/types';
import { parseAmount } from '@/lib/money';

type Line = { category_id: string; limit_amount: string };

export function BudgetForm() {
  const activeSheet = useUIStore((s) => s.activeSheet);
  const sheetData = useUIStore((s) => s.sheetData);
  const closeSheet = useUIStore((s) => s.closeSheet);

  const categories = useFinanceStore((s) => s.categories);
  const currencies = useFinanceStore((s) => s.currencies);
  const primaryCurrencyId = useFinanceStore((s) => s.primaryCurrencyId);
  const addBudget = useFinanceStore((s) => s.addBudget);
  const updateBudget = useFinanceStore((s) => s.updateBudget);

  const isEdit = activeSheet === 'edit-budget';
  const isOpen = activeSheet === 'new-budget' || isEdit;

  const [name, setName] = useState('');
  // En el teléfono no se enfoca solo: el teclado taparía el formulario
  // antes de que se llegue a ver.
  const autoFoco = useAutoFoco();
  const [period, setPeriod] = useState<'monthly' | 'weekly'>('monthly');
  const [currencyId, setCurrencyId] = useState(primaryCurrencyId);
  const [lines, setLines] = useState<Line[]>([{ category_id: '', limit_amount: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sólo se presupuestan gastos: poner un tope a un ingreso no tiene sentido.
  const expenseCategories = useMemo(
    () =>
      categories
        .filter((c) => c.type === 'expense')
        .sort((a, b) =>
          `${a.group_name} ${a.name}`.localeCompare(`${b.group_name} ${b.name}`)
        ),
    [categories]
  );

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSubmitting(false);

    const budget = sheetData?.budget as Budget | undefined;
    if (isEdit && budget) {
      setName(budget.name);
      setPeriod(budget.period);
      setCurrencyId(budget.currency_id);
      setLines(
        budget.categories.length
          ? budget.categories.map((c) => ({
              category_id: c.category_id,
              limit_amount: String(c.limit_amount),
            }))
          : [{ category_id: '', limit_amount: '' }]
      );
    } else {
      setName('');
      setPeriod('monthly');
      setCurrencyId(primaryCurrencyId);
      setLines([{ category_id: '', limit_amount: '' }]);
    }
  }, [isOpen, isEdit, sheetData, primaryCurrencyId]);

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const categoryOptions = useMemo(
    () => expenseCategories.map((c) => ({ value: c.id, label: c.name, hint: c.group_name })),
    [expenseCategories]
  );

  const total = lines.reduce((sum, l) => sum + (parseAmount(l.limit_amount) ?? 0), 0);

  const handleSubmit = async () => {
    if (submitting) return;

    if (!name.trim()) return setError('Poné un nombre al presupuesto.');

    const parsed = lines
      .filter((l) => l.category_id)
      .map((l) => ({
        category_id: l.category_id,
        limit_amount: parseAmount(l.limit_amount) ?? 0,
        spent_amount: 0,
      }));

    if (!parsed.length) return setError('Agregá al menos una categoría.');
    if (parsed.some((l) => l.limit_amount <= 0)) {
      return setError('Cada categoría necesita un tope mayor a cero.');
    }
    const ids = parsed.map((l) => l.category_id);
    if (new Set(ids).size !== ids.length) {
      return setError('Hay una categoría repetida.');
    }

    setError(null);
    setSubmitting(true);
    try {
      const payload = { name: name.trim(), period, currency_id: currencyId, categories: parsed };
      if (isEdit && sheetData?.budget) {
        await updateBudget((sheetData.budget as Budget).id, payload);
      } else {
        await addBudget(payload);
      }
      closeSheet();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar el presupuesto.');
    } finally {
      setSubmitting(false);
    }
  };

  const currency = currencies.find((c) => c.id === currencyId) || currencies[0];

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>
            {isEdit ? 'Editar presupuesto' : 'Nuevo presupuesto'}
          </ResponsiveModalTitle>
        </ResponsiveModalHeader>

        <ResponsiveModalBody className="space-y-3">
          <Field label="Nombre" htmlFor="presu-nombre">
            <Input
              id="presu-nombre"
              placeholder="Ej: Costos de cocina"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={autoFoco}
            />
          </Field>

            <Field label="Período">
              <Picker
                value={period}
                onValueChange={(v) => setPeriod(v as 'monthly' | 'weekly')}
                options={[
                  { value: 'monthly', label: 'Mensual' },
                  { value: 'weekly', label: 'Semanal' },
                ]}
                placeholder="Elegir"
              />
            </Field>

            <Field label="Moneda">
              <Picker
                value={currencyId}
                onValueChange={setCurrencyId}
                options={currencies.map((c) => ({ value: c.id, label: c.name, hint: c.code }))}
                placeholder="Elegir"
              />
            </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Topes por categoría</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                Total: {total.toLocaleString('es-AR')}
              </span>
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Picker
                      value={line.category_id}
                      onValueChange={(v) => setLine(i, { category_id: v })}
                      options={categoryOptions}
                      placeholder="Elegir categoría"
                    />
                  </div>

                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Tope"
                    value={line.limit_amount}
                    onChange={(e) => setLine(i, { limit_amount: e.target.value })}
                    className="w-28 shrink-0 tabular-nums"
                  />

                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                    disabled={lines.length === 1}
                    aria-label="Quitar categoría"
                    className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setLines((prev) => [...prev, { category_id: '', limit_amount: '' }])}
              className="w-full gap-2"
            >
              <Plus className="size-4" />
              Agregar categoría
            </Button>
          </div>

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
            {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear presupuesto'}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
