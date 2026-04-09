'use client';

import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
import { ResponsiveModal, ResponsiveModalContent, ResponsiveModalHeader, ResponsiveModalTitle } from '@/components/ui/responsive-modal';
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
      alert("Error guardando categoría: " + (e.message || JSON.stringify(e)));
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

        <div className="space-y-6 pb-6 mt-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Nombre</Label>
            <Input
              placeholder="Ej: Suscripciones, Cursos, etc."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 bg-accent/30 border-border/50"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as 'expense' | 'income')}>
              <SelectTrigger className="h-12 bg-accent/30 border-border/50 text-base">
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
              <SelectTrigger className="h-12 bg-accent/30 border-border/50 text-base">
                <SelectValue placeholder="Selecciona un macrogrupo..." />
              </SelectTrigger>
              <SelectContent>
                {existingGroups.map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-accent/10">
            <div className="space-y-0.5">
               <Label className="text-sm font-medium">¿Es Recurrente?</Label>
               <p className="text-xs text-muted-foreground">Esta categoría se paga periódicamente (ej: alquiler, internet).</p>
            </div>
            <input 
              type="checkbox" 
              checked={isRecurring} 
              onChange={e => setIsRecurring(e.target.checked)} 
              className="w-5 h-5 accent-primary" 
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="w-full h-12 text-base font-semibold mt-4"
          >
            {isEdit ? 'Guardar Cambios' : 'Crear Categoría'}
          </Button>
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
