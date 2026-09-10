'use client';

import { useEffect, useState } from 'react';
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
import { Picker } from '@/components/ui/picker';
import { parseAmount } from '@/lib/money';
import { Trash2 } from 'lucide-react';

export function PartnerForm() {
  const activeSheet = useUIStore((s) => s.activeSheet);
  const sheetData = useUIStore((s) => s.sheetData);
  const closeSheet = useUIStore((s) => s.closeSheet);

  const addPartner = useFinanceStore((s) => s.addPartner);
  const updatePartner = useFinanceStore((s) => s.updatePartner);
  const removePartner = useFinanceStore((s) => s.removePartner);
  const partners = useFinanceStore((s) => s.partners);
  const people = useFinanceStore((s) => s.people);
  const dialog = useGlobalDialog();

  const isEdit = activeSheet === 'edit-partner';
  const isOpen = activeSheet === 'new-partner' || isEdit;
  const editing = isEdit ? (sheetData?.partner as any) : null;

  const [name, setName] = useState('');
  const [pct, setPct] = useState('');
  const [userId, setUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // El socio se lee acá adentro y no de `editing`: inicializar desde un valor
  // del render hace que cada render del padre vuelva a pisar lo que el usuario
  // esté tipeando.
  useEffect(() => {
    if (isOpen) {
      const socio = sheetData?.partner as any;
      setError(null);
      setName(socio?.name ?? '');
      setPct(socio?.ownership_pct ? String(socio.ownership_pct) : '');
      setUserId(socio?.user_id ?? '');
      setNotes(socio?.notes ?? '');
    }
  }, [isOpen, sheetData]);

  // Cuánto queda por repartir, sin contar al socio que se está editando.
  const asignado = partners
    .filter((p) => p.id !== editing?.id)
    .reduce((s, p) => s + p.ownership_pct, 0);
  const disponible = Math.max(0, 100 - asignado);

  // Las personas del espacio que todavía no están tomadas por otro socio.
  const usuarioOptions = [
    { value: '', label: 'Sin vincular' },
    ...Object.values(people)
      .filter((per) => !partners.some((p) => p.user_id === per.id && p.id !== editing?.id))
      .map((per) => ({
        value: per.id,
        label: per.full_name || per.email || 'Sin nombre',
        hint: per.full_name ? (per.email ?? undefined) : undefined,
      })),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Poné el nombre del socio.');

    const porcentaje = pct.trim() ? parseAmount(pct) : 0;
    if (porcentaje === null || porcentaje < 0 || porcentaje > 100) {
      return setError('La participación va de 0 a 100.');
    }

    try {
      if (isEdit) {
        await updatePartner(editing.id, {
          name: name.trim(),
          ownership_pct: porcentaje,
          notes: notes.trim() || null,
          user_id: userId || null,
        });
      } else {
        await addPartner({ name: name.trim(), ownership_pct: porcentaje, notes: notes.trim() });
      }
      closeSheet();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el socio.');
    }
  };

  const handleDelete = async () => {
    const ok = await dialog.confirm(
      'Eliminar socio',
      'El socio deja de aparecer, pero sus aportes y retiros ya cargados se mantienen: es plata que se movió de verdad.'
    );
    if (!ok) return;
    await removePartner(editing.id);
    closeSheet();
  };

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(o) => !o && closeSheet()}>
      <ResponsiveModalContent className="sm:max-w-[440px]">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{isEdit ? 'Editar socio' : 'Nuevo socio'}</ResponsiveModalTitle>
        </ResponsiveModalHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <ResponsiveModalBody className="space-y-3">
              <Field label="Nombre" htmlFor="socio-nombre">
                <Input
                  id="socio-nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Matías"
                  autoFocus
                />
              </Field>

              <Field
                label="Participación"
                hint={`Queda ${disponible.toLocaleString('es-AR')}%`}
                htmlFor="socio-pct"
              >
                <Input
                  id="socio-pct"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  className="tabular-nums"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                />
              </Field>

            {/* El socio existe antes que la cuenta: se carga con nombre y recién
                cuando la persona se registra en la app se las vincula. */}
            {isEdit && (
              <Field label="Usuario de la app" hint="Opcional">
                <Picker
                  value={userId}
                  onValueChange={setUserId}
                  options={usuarioOptions}
                  placeholder="Sin vincular"
                  emptyMessage="Nadie más en este espacio"
                />
              </Field>
            )}

            <Field label="Nota" hint="Opcional" htmlFor="socio-nota">
              <Textarea
                id="socio-nota"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: entró en enero, aporta capital de trabajo"
                maxRows={3}
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl p-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
                Eliminar socio
              </button>
            )}
          </ResponsiveModalBody>

          <ResponsiveModalFooter>
            <Button type="submit">{isEdit ? 'Guardar cambios' : 'Agregar socio'}</Button>
          </ResponsiveModalFooter>
        </form>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
