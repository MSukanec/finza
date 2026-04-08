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

  const isOpen = activeSheet === 'new-transaction';

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');

  useEffect(() => {
    if (isOpen && sheetData?.type) {
      setType(sheetData.type as TransactionType);
    }
  }, [isOpen, sheetData]);

  useEffect(() => {
    if (isOpen && accounts.length > 0 && !accountId) {
      setAccountId(accounts[0].id);
    }
  }, [isOpen, accounts, accountId]);

  const filteredCategories = categories.filter((c) =>
    type === 'transfer' ? false : c.type === type
  );

  const handleSubmit = () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || !accountId) return;

    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    addTransaction({
      type,
      amount: numAmount,
      currency_id: account.currency_id,
      category_id: type === 'transfer' ? null : categoryId || null,
      account_id: accountId,
      destination_account_id: type === 'transfer' ? destinationAccountId || null : null,
      description: description || getDefaultDescription(type),
      date: new Date().toISOString(),
    });

    // Reset form
    setAmount('');
    setDescription('');
    setCategoryId('');
    setDestinationAccountId('');
    closeSheet();
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
          <DialogTitle className="text-lg text-center sm:text-left">Nuevo Movimiento</DialogTitle>
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

          {/* Amount */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Monto</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-2xl font-bold h-14 bg-accent/30 border-border/50 text-center"
              autoFocus
            />
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
                <SelectValue placeholder="Seleccionar cuenta" />
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
                  <SelectValue placeholder="Seleccionar cuenta destino" />
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
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Categoría</Label>
              <Select value={categoryId} onValueChange={(v) => v && setCategoryId(v)}>
                <SelectTrigger className="bg-accent/30 border-border/50">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((cat) => (
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
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!amount || !accountId}
            className="w-full h-12 text-base font-semibold"
          >
            Guardar Movimiento
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
