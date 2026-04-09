'use client';

import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
import { ResponsiveModal, ResponsiveModalContent, ResponsiveModalHeader, ResponsiveModalTitle } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect, useMemo } from 'react';
import type { TransactionType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react';

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

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  
  const [groupName, setGroupName] = useState('General');
  const [categoryId, setCategoryId] = useState('');
  const [periodMonth, setPeriodMonth] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (isEdit && sheetData?.transaction) {
        const tx = sheetData.transaction as any;
        setType(tx.type);
        setAmount(tx.amount.toString());
        setDescription(tx.description || '');
        setDate(tx.date ? tx.date.split('T')[0] : new Date().toISOString().split('T')[0]);
        setAccountId(tx.account_id);
        if (tx.destination_account_id) setDestinationAccountId(tx.destination_account_id);
        
        if (tx.category_id) {
           setCategoryId(tx.category_id);
           const c = categories.find(cat => cat.id === tx.category_id);
           if (c && c.group_name) setGroupName(c.group_name);
        }
      } else {
        if (sheetData?.type) setType(sheetData.type as TransactionType);
        else setType('expense');
        setAmount('');
        setDescription('');
        setDate(new Date().toISOString().split('T')[0]);
        setPeriodMonth('');
        setCategoryId('');
        setGroupName('General');
      }
    }
  }, [isOpen, isEdit, sheetData, categories]);

  useEffect(() => {
    if (isOpen && accounts.length > 0 && !accountId && !isEdit) {
      setAccountId(accounts[0].id);
    }
  }, [isOpen, accounts, accountId, isEdit]);

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => (type === 'transfer' ? false : c.type === type));
  }, [categories, type]);

  const availableGroups = useMemo(() => {
    const groups = new Set(filteredCategories.map(c => c.group_name || 'General'));
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
  }, [filteredCategories]);

  const categoriesInGroup = useMemo(() => {
    return filteredCategories
       .filter(c => (c.group_name || 'General') === groupName)
       .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredCategories, groupName]);

  // Si cambiamos de grupo, resetear categoría
  useEffect(() => {
    if (isOpen && categoryId) {
       const isValid = categoriesInGroup.find(c => c.id === categoryId);
       if (!isValid) {
         setCategoryId('');
         setPeriodMonth('');
       }
    }
  }, [groupName, categoriesInGroup, isOpen]);

  const selectedCategory = useMemo(() => {
    return categoriesInGroup.find(c => c.id === categoryId);
  }, [categoriesInGroup, categoryId]);

  const isRecurring = selectedCategory?.is_recurring || false;

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || !accountId) return;

    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    try {
      const payload = {
        type,
        amount: numAmount,
        currency_id: account.currency_id,
        category_id: type === 'transfer' ? null : categoryId || null,
        account_id: accountId,
        destination_account_id: type === 'transfer' ? destinationAccountId || null : null,
        description: description || getDefaultDescription(type),
        date: new Date(date).toISOString(),
        period_month: type !== 'transfer' && isRecurring && periodMonth ? periodMonth : undefined,
      };

      if (isEdit && sheetData?.transaction) {
         await updateTransaction((sheetData.transaction as any).id, payload);
      } else {
         await addTransaction(payload);
      }

      // Reset form
      setAmount('');
      setDescription('');
      setCategoryId('');
      setPeriodMonth('');
      setDestinationAccountId('');
      closeSheet();
    } catch (e: any) {
      alert("Error guardando transacción: " + (e.message || JSON.stringify(e)));
    }
  };

  const typeOptions = [
    { value: 'income' as const, label: 'Ingreso', icon: TrendingUp, className: 'bg-income/15 text-income border-income/30' },
    { value: 'expense' as const, label: 'Gasto', icon: TrendingDown, className: 'bg-expense/15 text-expense border-expense/30' },
    { value: 'transfer' as const, label: 'Transferencia', icon: ArrowLeftRight, className: 'bg-transfer/15 text-transfer border-transfer/30' },
  ];

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle className="text-xl sm:text-lg text-center sm:text-left">
            {isEdit ? 'Editar Movimiento' : 'Nuevo Movimiento'}
          </ResponsiveModalTitle>
        </ResponsiveModalHeader>

        <div className="space-y-6 pb-6">
          {/* Type selector */}
          <div className="grid grid-cols-3 gap-2">
            {typeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setType(opt.value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200',
                  type === opt.value ? opt.className : 'border-transparent bg-accent/30 text-muted-foreground'
                )}
              >
                <opt.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Amount */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Monto</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-lg font-bold h-12 bg-accent/30 border-border/50 text-center"
                autoFocus
              />
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Fecha</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-12 bg-accent/30 border-border/50"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Descripción</Label>
            <Input
              placeholder="¿En qué gastaste?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-accent/30 border-border/50"
            />
          </div>

          {/* Account */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {type === 'transfer' ? 'Cuenta Origen' : 'Cuenta'}
            </Label>
            <Select value={accountId} onValueChange={(v) => v && setAccountId(v)}>
              <SelectTrigger className="h-12 bg-accent/30 border-border/50 text-base">
                <SelectValue>
                  {accountId ? accounts.find(a => a.id === accountId)?.name : 'Seleccionar cuenta'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {[...accounts].sort((a, b) => a.name.localeCompare(b.name)).map((acc) => {
                  const cur = currencies.find((c) => c.id === acc.currency_id);
                  return (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name} ({cur?.code})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Destination account (for transfers) */}
          {type === 'transfer' && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Cuenta Destino</Label>
              <Select value={destinationAccountId} onValueChange={(v) => v && setDestinationAccountId(v)}>
                <SelectTrigger className="h-12 bg-accent/30 border-border/50 text-base">
                  <SelectValue>
                    {destinationAccountId ? accounts.find(a => a.id === destinationAccountId)?.name : 'Seleccionar destino'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[...accounts]
                    .filter((a) => a.id !== accountId)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((acc) => {
                      const cur = currencies.find((c) => c.id === acc.currency_id);
                      return (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} ({cur?.code})
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Category (not for transfers) */}
          {type !== 'transfer' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Macrogrupo</Label>
                <Select value={groupName} onValueChange={(v) => v && setGroupName(v)}>
                  <SelectTrigger className="h-12 bg-accent/30 border-border/50 text-base">
                    <SelectValue>{groupName}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableGroups.length > 0 ? availableGroups.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    )) : <SelectItem value="General">General</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Categoría</Label>
                <Select value={categoryId} onValueChange={(v) => v && setCategoryId(v)}>
                  <SelectTrigger className="h-12 bg-accent/30 border-border/50 text-base">
                    <SelectValue>
                      {categoryId ? categoriesInGroup.find(c => c.id === categoryId)?.name : 'Seleccionar...'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesInGroup.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          {cat.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

            {/* Period if recurring */}
            {type !== 'transfer' && isRecurring && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                <Label className="text-xs text-muted-foreground">Período de Facturación (Mes/Año)</Label>
                <Input
                  type="month"
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(e.target.value)}
                  className="h-12 bg-primary/10 border-primary/30 font-medium"
                />
              </div>
            )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!amount || !accountId}
            className="w-full h-12 text-base font-semibold"
          >
            {isEdit ? 'Guardar Cambios' : 'Guardar Movimiento'}
          </Button>
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function getDefaultDescription(type: TransactionType): string {
  switch (type) {
    case 'income': return 'Ingreso';
    case 'expense': return 'Gasto';
    case 'transfer': return 'Transferencia';
  }
}
