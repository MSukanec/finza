'use client';

import type { TransactionType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface TransactionFiltersProps {
  filterType: TransactionType | 'all';
  onFilterChange: (type: TransactionType | 'all') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const filterTabs: { value: TransactionType | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'transfer', label: 'Transferencias' },
];

export function TransactionFilters({
  filterType,
  onFilterChange,
  searchQuery,
  onSearchChange,
}: TransactionFiltersProps) {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar movimiento..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 bg-accent/30 border-border/50"
        />
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {filterTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onFilterChange(tab.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200',
              filterType === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-accent/50 text-muted-foreground hover:bg-accent'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
