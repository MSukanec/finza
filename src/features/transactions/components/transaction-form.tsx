'use client';

import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
    return Array.from(groups);
  }, [filteredCategories]);

  const categoriesInGroup = useMemo(() => {
    return filteredCategories.filter(c => (c.group_name || 'General') === groupName);
  }, [filteredCategories, groupName]);

  // Si cambiamos de grupo, resetear categoría
  useEffect(() => {
    if (isOpen && categoryId) {
       const isValid = categoriesInGroup.find(c => c.id === categoryId);
       if (!isValid) setCategoryId('');
    }
  }, [groupName, categoriesInGroup, isOpen]);

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg text-center sm:text-left">
            {isEdit ? 'Editar Movimiento' : 'Nuevo Movimiento'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pb-6">
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
              <SelectTrigger className="bg-accent/30 border-border/50">
                <SelectValue>
                  {accountId ? accounts.find(a => a.id === accountId)?.name : 'Seleccionar cuenta'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => {
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
                <SelectTrigger className="bg-accent/30 border-border/50">
                  <SelectValue>
                    {destinationAccountId ? accounts.find(a => a.id === destinationAccountId)?.name : 'Seleccionar destino'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => a.id !== accountId)
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
                  <SelectTrigger className="bg-accent/30 border-border/50">
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
                  <SelectTrigger className="bg-accent/30 border-border/50">
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

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!amount || !accountId}
            className="w-full h-12 text-base font-semibold"
          >
            {isEdit ? 'Guardar Cambios' : 'Guardar Movimiento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getDefaultDescription(type: TransactionType): string {
  switch (type) {
    case 'income': return 'Ingreso';
    case 'expense': return 'Gasto';
    case 'transfer': return 'Transferencia';
  }
}
