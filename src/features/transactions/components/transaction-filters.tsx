'use client';

import type { TransactionType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Search, Calendar, Wallet, Filter, Tags, CheckSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinanceStore } from '@/stores/finance-store';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface TransactionFiltersProps {
  filterType: TransactionType | 'all';
  onFilterChange: (type: TransactionType | 'all') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterWalletId: string;
  onWalletChange: (w: string) => void;
  filterCategoryId: string;
  onCategoryChange: (c: string) => void;
  filterGroupId: string;
  onGroupChange: (g: string) => void;
  dateFrom: string;
  onDateFromChange: (d: string) => void;
  dateTo: string;
  onDateToChange: (d: string) => void;
}

const filterTabs: { value: TransactionType | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos los tipos' },
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
  filterCategoryId,
  onCategoryChange,
  filterGroupId,
  onGroupChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange
}: TransactionFiltersProps) {
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const groups = useFinanceStore((s) => s.categoryGroups);

  // Active filters count for badge
  let activeFiltersCount = 0;
  if (filterType !== 'all') activeFiltersCount++;
  if (filterWalletId !== 'all') activeFiltersCount++;
  if (filterCategoryId !== 'all') activeFiltersCount++;
  if (filterGroupId !== 'all') activeFiltersCount++;
  if (dateFrom) activeFiltersCount++;
  if (dateTo) activeFiltersCount++;

  const handleClearFilters = () => {
     onFilterChange('all');
     onWalletChange('all');
     onCategoryChange('all');
     onGroupChange('all');
     onDateFromChange('');
     onDateToChange('');
  };

  const filteredCategories = filterGroupId !== 'all' 
       ? categories.filter(c => c.group_id === filterGroupId) 
       : categories;

  return (
    <div className="flex items-center gap-2 w-full">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar movimiento..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-10 bg-accent/20 border-border/50"
        />
      </div>

      {/* Popover Filters */}
      <Popover>
        <PopoverTrigger className={buttonVariants({ variant: 'outline', className: 'h-10 gap-2 px-4 shadow-sm relative' })}>
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="hidden sm:inline font-medium">Filtros</span>
            {activeFiltersCount > 0 && (
                <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold shadow-sm">
                   {activeFiltersCount}
                </span>
            )}
        </PopoverTrigger>
        <PopoverContent side="left" align="start" className="w-[340px] p-4 space-y-4 shadow-xl border-border/50">
           
           <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-semibold text-sm">Filtros Avanzados</h4>
              {activeFiltersCount > 0 && (
                  <button onClick={handleClearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium">
                     Limpiar todo
                  </button>
              )}
           </div>

           <div className="space-y-4">
              
              {/* Tipo de Gasto */}
              <div className="space-y-1.5">
                 <Label className="text-xs text-muted-foreground font-medium">Tipo de Registro</Label>
                 <Select value={filterType} onValueChange={(v: any) => onFilterChange(v)}>
                    <SelectTrigger className="h-9">
                       <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                       {filterTabs.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                 </Select>
              </div>

              {/* Cuenta/Billetera */}
              <div className="space-y-1.5">
                 <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Billetera o Cuenta</Label>
                 <Select value={filterWalletId} onValueChange={(val) => { if (val) onWalletChange(val); }}>
                    <SelectTrigger className="h-9">
                       <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                       <SelectItem value="all">Cualquier cuenta</SelectItem>
                       {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                 </Select>
              </div>

              {/* Grupo y Categoría */}
              <div className="space-y-4">
                 <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><CheckSquare className="w-3.5 h-3.5" /> Grupo</Label>
                    <Select value={filterGroupId} onValueChange={(val) => { if (val) { onGroupChange(val); onCategoryChange('all'); } }}>
                       <SelectTrigger className="h-9">
                          <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                       </SelectContent>
                    </Select>
                 </div>
                 
                 <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Tags className="w-3.5 h-3.5" /> Categoría</Label>
                    <Select value={filterCategoryId} onValueChange={(val) => { if (val) onCategoryChange(val); }}>
                       <SelectTrigger className="h-9">
                          <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          {filteredCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                       </SelectContent>
                    </Select>
                 </div>
              </div>

              {/* Rango de Fechas */}
              <div className="space-y-4">
                 <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Fecha Desde</Label>
                    <Input 
                       type="date" 
                       value={dateFrom} 
                       onChange={(e) => onDateFromChange(e.target.value)} 
                       className="h-9 text-xs" 
                    />
                 </div>
                 <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Fecha Hasta</Label>
                    <Input 
                       type="date" 
                       value={dateTo} 
                       onChange={(e) => onDateToChange(e.target.value)} 
                       className="h-9 text-xs" 
                    />
                 </div>
              </div>

           </div>
           
        </PopoverContent>
      </Popover>

    </div>
  );
}
