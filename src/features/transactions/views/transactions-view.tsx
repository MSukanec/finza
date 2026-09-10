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

  // Renderizar 1000+ tarjetas de una vez traba la página. Se muestran de a tandas.
  const PAGE = 60;
  const [visibleCount, setVisibleCount] = useState(PAGE);

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

  // Cualquier cambio de filtro vuelve a la primera tanda.
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [filterType, searchQuery, filterWalletId, filterCategoryId, filterGroupId, dateFrom, dateTo]);

  return (
    <PageLayout
      title="Movimientos"
      icon={ArrowLeftRight}
      actions={
        <>
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
          <Button size="sm" className="gap-1.5" onClick={() => openSheet('new-transaction')}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Nuevo</span>
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        {filtered.length === transactions.length
          ? `${filtered.length.toLocaleString('es-AR')} movimientos`
          : `${filtered.length.toLocaleString('es-AR')} de ${transactions.length.toLocaleString('es-AR')} movimientos`}
      </p>

      <TransactionList
        transactions={filtered.slice(0, visibleCount)}
        onEdit={(tx) => openSheet('edit-transaction', { transaction: tx })}
      />

      {visibleCount < filtered.length && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => setVisibleCount((n) => n + PAGE)}
            className="min-w-48"
          >
            Cargar más ({(filtered.length - visibleCount).toLocaleString('es-AR')} restantes)
          </Button>
        </div>
      )}
    </PageLayout>
  );
}
