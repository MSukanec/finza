'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { TransactionList } from '../components/transaction-list';
import { TransactionFilters } from '../components/transaction-filters';
import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TransactionType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus, ArrowLeftRight } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { PageLayout } from '@/components/layout/page-layout';

export function TransactionsView() {
  const transactions = useFinanceStore((s) => s.transactions);
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterWalletId, setFilterWalletId] = useState<string>('all');
  
  const searchParams = useSearchParams();
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');
  
  useEffect(() => {
    const categoryParam = searchParams.get('category');
    if (categoryParam) {
      setFilterCategoryId(categoryParam);
    }
  }, [searchParams]);

  const [filterGroupId, setFilterGroupId] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  const openSheet = useUIStore((s) => s.openSheet);

  const categories = useFinanceStore((s) => s.categories);

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
    if (filterCategoryId !== 'all') {
      result = result.filter((t) => t.category_id === filterCategoryId);
    }
    if (filterGroupId !== 'all') {
      result = result.filter((t) => {
         const cat = categories.find(c => c.id === t.category_id);
         return cat?.group_id === filterGroupId;
      });
    }
    return result;
  }, [transactions, categories, filterType, searchQuery, filterWalletId, filterCategoryId, filterGroupId, dateFrom, dateTo]);

  return (
    <PageLayout
       title="Movimientos"
       icon={ArrowLeftRight}
       actions={
            <Button size="sm" className="gap-2" onClick={() => openSheet('new-transaction')}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nuevo Registro</span>
            </Button>
       }
    >
      <TransactionFilters
        filterType={filterType}
        onFilterChange={setFilterType}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterWalletId={filterWalletId}
        onWalletChange={setFilterWalletId}
        filterCategoryId={filterCategoryId}
        onCategoryChange={setFilterCategoryId}
        filterGroupId={filterGroupId}
        onGroupChange={setFilterGroupId}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
      />
      <TransactionList 
        transactions={filtered} 
        onEdit={(tx) => openSheet('edit-transaction', { transaction: tx })}
      />
    </PageLayout>
  );
}
