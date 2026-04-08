'use client';

import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

  useEffect(() => {
    if (isOpen) {
      const cat = sheetData?.category as any;
      if (isEdit && cat) {
        setName(cat.name);
        setType(cat.type);
        setGroupName(cat.group_name || 'General');
      } else {
        setName('');
        setType('expense');
        setGroupName('General');
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

  const existingGroups = Array.from(new Set(categories.map(c => c.group_name || 'General')));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md p-6">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-lg text-center sm:text-left">
            {isEdit ? 'Editar Categoría' : 'Nueva Categoría'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pb-6">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Nombre</Label>
            <Input
              placeholder="Ej: Suscripciones, Cursos, etc."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-accent/30 border-border/50"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as 'expense' | 'income')}>
              <SelectTrigger className="bg-accent/30 border-border/50">
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
            <Input
              placeholder="Ej: General, Sincel, Entretenimiento"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="bg-accent/30 border-border/50"
              list="existing-groups"
            />
            <datalist id="existing-groups">
              {existingGroups.map(g => <option key={g} value={g} />)}
            </datalist>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="w-full h-12 text-base font-semibold mt-4"
          >
            {isEdit ? 'Guardar Cambios' : 'Crear Categoría'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
