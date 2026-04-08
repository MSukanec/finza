'use client';

import type { TransactionType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Search, Calendar, Wallet } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinanceStore } from '@/stores/finance-store';

interface TransactionFiltersProps {
  filterType: TransactionType | 'all';
  onFilterChange: (type: TransactionType | 'all') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterWalletId: string;
  onWalletChange: (w: string) => void;
  dateFrom: string;
  onDateFromChange: (d: string) => void;
  dateTo: string;
  onDateToChange: (d: string) => void;
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
  filterWalletId,
  onWalletChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange
}: TransactionFiltersProps) {
  const accounts = useFinanceStore((s) => s.accounts);
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

      {/* Advanced Filters: Dates and Wallet */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Select value={filterWalletId} onValueChange={(val) => val && onWalletChange(val)}>
            <SelectTrigger className="w-full bg-accent/30 border-border/50 text-xs text-muted-foreground h-9">
              <div className="flex items-center gap-2">
                 <Wallet className="w-4 h-4" />
                 <SelectValue placeholder="Todas las billeteras" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las billeteras</SelectItem>
              {accounts.map(acc => (
                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 flex-1 relative">
           <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
           <Input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="pl-8 bg-accent/30 border-border/50 text-xs h-9 w-full"
           />
           <span className="text-muted-foreground text-xs">-</span>
           <Input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="bg-accent/30 border-border/50 text-xs h-9 w-full"
           />
        </div>
      </div>
    </div>
  );
}
