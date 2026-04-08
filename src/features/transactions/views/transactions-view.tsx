'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { TransactionList } from '../components/transaction-list';
import { TransactionForm } from '../components/transaction-form';
import { TransactionFilters } from '../components/transaction-filters';
import { useState, useMemo } from 'react';
import type { TransactionType } from '@/lib/types';

export function TransactionsView() {
  const transactions = useFinanceStore((s) => s.transactions);
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    let result = transactions;
    if (filterType !== 'all') {
      result = result.filter((t) => t.type === filterType);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) => t.description.toLowerCase().includes(q));
    }
    return result;
  }, [transactions, filterType, searchQuery]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Movimientos</h1>
      </div>
      <TransactionFilters
        filterType={filterType}
        onFilterChange={setFilterType}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <TransactionList transactions={filtered} />
      <TransactionForm />
    </div>
  );
}
