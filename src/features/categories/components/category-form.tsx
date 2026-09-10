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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import type { TransactionType } from '@/lib/types';

export function CategoryForm() {
  const activeSheet = useUIStore((s) => s.activeSheet);
  const sheetData = useUIStore((s) => s.sheetData);
  const closeSheet = useUIStore((s) => s.closeSheet);

  const addCategory = useFinanceStore((s) => s.addCategory);
  const updateCategory = useFinanceStore((s) => s.updateCategory);
  
  const categories = useFinanceStore((s) => s.categories);

  const isEdit = activeSheet === 'edit-category';
  const isOpen = activeSheet === 'new-category' || isEdit;

  const [name, setName] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [groupName, setGroupName] = useState('General');
  const [isRecurring, setIsRecurring] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const cat = sheetData?.category as any;
      if (isEdit && cat) {
        setName(cat.name);
        setType(cat.type);
        setGroupName(cat.group_name || 'General');
        setIsRecurring(cat.is_recurring || false);
      } else {
        setName('');
        setType('expense');
        setGroupName('General');
        setIsRecurring(false);
      }
    }
  }, [isOpen, isEdit, sheetData]);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!name.trim()) return setError('Poné un nombre para la categoría.');
    setError(null);
    setSubmitting(true);
    if (!name.trim()) return;

    try {
      const payload = {
        name: name.trim(),
        type,
        group_name: groupName.trim() || 'General',
        is_recurring: isRecurring,
      };

      if (isEdit && sheetData?.category) {
        await updateCategory((sheetData.category as any).id, payload);
      } else {
        await addCategory(payload);
      }
      closeSheet();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la categoría.');
    } finally {
      setSubmitting(false);
    }
  };

  const existingGroups = Array.from(new Set(categories.filter(c => c.type === type).map(c => c.group_name || 'General'))).sort((a, b) => a.localeCompare(b));

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle className="text-xl sm:text-lg text-center sm:text-left">
            {isEdit ? 'Editar Categoría' : 'Nueva Categoría'}
          </ResponsiveModalTitle>
        </ResponsiveModalHeader>

        <ResponsiveModalBody className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Nombre</Label>
            <Input
              placeholder="Ej: Suscripciones, Cursos, etc."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as 'expense' | 'income')}>
              <SelectTrigger>
                <SelectValue>{type === 'expense' ? 'Gasto' : 'Ingreso'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Gasto</SelectItem>
                <SelectItem value="income">Ingreso</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Macrogrupo</Label>
            <Select value={groupName} onValueChange={(v) => v && setGroupName(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un macrogrupo..." />
              </SelectTrigger>
              <SelectContent>
                {existingGroups.map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-accent/50">
            <div className="space-y-0.5">
               <Label className="text-sm font-medium">¿Es Recurrente?</Label>
               <p className="text-xs text-muted-foreground">Esta categoría se paga periódicamente (ej: alquiler, internet).</p>
            </div>
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={e => setIsRecurring(e.target.checked)}
              className="size-5 accent-primary"
            />
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
            {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear categoría'}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
