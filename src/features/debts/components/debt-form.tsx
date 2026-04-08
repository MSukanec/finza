'use client';

import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Trash2 } from 'lucide-react';

export function DebtForm() {
  const activeSheet = useUIStore((s) => s.activeSheet);
  const sheetData = useUIStore((s) => s.sheetData);
  const closeSheet = useUIStore((s) => s.closeSheet);

  const currencies = useFinanceStore((s) => s.currencies);
  const user = useFinanceStore((s) => s.user);

  const isEdit = activeSheet === 'edit-debt';
  const isOpen = activeSheet === 'new-debt' || isEdit;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currencyCode, setCurrencyCode] = useState('ARS');
  const [totalAmount, setTotalAmount] = useState('');
  const [loading, setLoading] = useState(false);

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
    setLoading(true);

    try {
        const { data: userData } = await supabase.from('users').select('id').eq('auth_id', user?.id).single();
        if (!userData) throw new Error("Usario no encontrado.");

        if (isEdit) {
            const d = sheetData?.debt as any;
            
            // 1. Update Category Name
            await supabase.from('categories').update({ name }).eq('id', d.category_id);
            
            // 2. Update Debt Info
            await supabase.from('debts').update({
                total_amount: Number(totalAmount),
                currency_code: currencyCode,
                description
            }).eq('id', d.id);
            
        } else {
            // Find Deudas group
            const { data: groupData } = await supabase.from('category_groups')
                 .select('id')
                 .eq('name', 'Deudas')
                 .is('is_system', true)
                 .single();
                 
            if (!groupData) throw new Error("No se encontro el grupo de Deudas del sistema.");

            // 1. Create Category
            const { data: newCat } = await supabase.from('categories').insert({
                user_id: userData.id,
                name,
                group_id: groupData.id,
                type: 'expense' // Debts are generally expenses to pay off
            }).select().single();

            if (!newCat) throw new Error("Error creando categoría de la deuda.");

            // 2. Create Debt
            await supabase.from('debts').insert({
                user_id: userData.id,
                category_id: newCat.id,
                total_amount: Number(totalAmount),
                currency_code: currencyCode,
                description
            });
        }
        
        await useFinanceStore.getState().hydrate();
        closeSheet();
    } catch (err: any) {
        console.error("Error saving debt:", err);
        alert(err.message);
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de eliminar esta deuda? Se eliminará la categoría pero no los movimientos de pago.')) return;
    setLoading(true);
    try {
        const d = sheetData?.debt as any;
        await supabase.from('categories').delete().eq('id', d.category_id); // ON DELETE CASCADE destroys the Debt row automatically
        await useFinanceStore.getState().hydrate();
        closeSheet();
    } catch (e) {
        console.error("Error deleting", e);
    } finally {
        setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && closeSheet()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Deuda' : 'Nueva Deuda'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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
                className="pl-7"
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

          <div className="pt-4 flex items-center justify-between">
            {isEdit ? (
                <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={handleDelete} disabled={loading}>
                   <Trash2 className="w-4 h-4" />
                </Button>
            ) : <div/>}

            <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeSheet} disabled={loading}>
                Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                {loading ? 'Guardando...' : (isEdit ? 'Actualizar' : 'Crear Deuda')}
                </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
