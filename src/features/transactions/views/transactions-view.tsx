'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { TransactionList } from '../components/transaction-list';
import { TransactionFilters } from '../components/transaction-filters';
import { useState, useMemo } from 'react';
import type { TransactionType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';

export function TransactionsView() {
  const transactions = useFinanceStore((s) => s.transactions);
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterWalletId, setFilterWalletId] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  const openSheet = useUIStore((s) => s.openSheet);

  const filtered = useMemo(() => {
    let result = transactions;
    if (filterType !== 'all') {
      result = result.filter((t) => t.type === filterType);
    }
    if (filterWalletId !== 'all') {
      result = result.filter((t) => t.account_id === filterWalletId || t.destination_account_id === filterWalletId);
    }
    if (dateFrom) {
      result = result.filter((t) => new Date(t.date) >= new Date(dateFrom + 'T00:00:00'));
    }
    if (dateTo) {
      result = result.filter((t) => {
         const d = new Date(t.date);
         const toD = new Date(dateTo + 'T23:59:59');
         return d <= toD;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) => t.description.toLowerCase().includes(q));
    }
    return result;
  }, [transactions, filterType, searchQuery, filterWalletId, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Movimientos</h1>
        <Button size="sm" className="gap-2" onClick={() => openSheet('new-transaction')}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo Registro</span>
        </Button>
      </div>
      <TransactionFilters
        filterType={filterType}
        onFilterChange={setFilterType}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterWalletId={filterWalletId}
        onWalletChange={setFilterWalletId}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
      />
      <TransactionList 
        transactions={filtered} 
        onEdit={(tx) => openSheet('edit-transaction', { transaction: tx })}
      />
    </div>
  );
}
