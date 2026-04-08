'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { useUIStore } from '@/stores/ui-store';
import { getIcon } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money';

// Native UI Accordion Helper Component
function SimpleAccordion({ title, summary, children, defaultOpen = false }: { title: React.ReactNode, summary: React.ReactNode, children: React.ReactNode, defaultOpen?: boolean }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    
    return (
        <div className="border border-border/50 rounded-xl overflow-hidden mb-3 bg-card">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 bg-accent/20 hover:bg-accent/40 transition-colors text-left"
            >
                <div className="flex items-center gap-3">
                   {isOpen ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                   {title}
                </div>
                <div>
                   {summary}
                </div>
            </button>
            {isOpen && (
                <div className="p-2 border-t border-border/50">
                    {children}
                </div>
            )}
        </div>
    );
}

export function CategoriesView() {
  const categories = useFinanceStore((s) => s.categories);
  const transactions = useFinanceStore((s) => s.transactions);
  const removeCategory = useFinanceStore((s) => s.removeCategory);
  const openSheet = useUIStore((s) => s.openSheet);

  // Group and enrich data
  const { incomes, expenses } = useMemo(() => {
     const statsByCat = new Map<string, { uses: number, ARS: number, USD: number }>();
     
     transactions.forEach(t => {
         if (!t.category_id) return;
         const current = statsByCat.get(t.category_id) || { uses: 0, ARS: 0, USD: 0 };
         current.uses += 1;
         if (t.currency_code === 'USD') {
             current.USD += Math.abs(t.amount);
         } else {
             current.ARS += Math.abs(t.amount);
         }
         statsByCat.set(t.category_id, current);
     });

     const buildGroups = (typeFilter: 'income'|'expense') => {
         const filteredCats = categories.filter(c => c.type === typeFilter);
         const groupsMap = new Map<string, any>();

         filteredCats.forEach(cat => {
             const gName = (cat.group_name || 'General').trim();
             if (!groupsMap.has(gName)) {
                 groupsMap.set(gName, {
                     groupName: gName,
                     totalUses: 0,
                     totalARS: 0,
                     totalUSD: 0,
                     cats: []
                 });
             }
             
             const stats = statsByCat.get(cat.id) || { uses: 0, ARS: 0, USD: 0 };
             const group = groupsMap.get(gName);
             
             group.totalUses += stats.uses;
             group.totalARS += stats.ARS;
             group.totalUSD += stats.USD;
             
             group.cats.push({
                 ...cat,
                 stats
             });
         });

         const groupsArray = Array.from(groupsMap.values());
         // Sort groups alphabetically
         groupsArray.sort((a,b) => a.groupName.localeCompare(b.groupName));
         
         // Sort categories within groups alphabetically
         groupsArray.forEach(g => {
             g.cats.sort((a: any, b: any) => a.name.localeCompare(b.name));
         });

         return groupsArray;
     };

     return {
         incomes: buildGroups('income'),
         expenses: buildGroups('expense')
     };
  }, [categories, transactions]);


  const renderGroup = (group: any, type: 'income' | 'expense') => {
      return (
          <SimpleAccordion 
             key={group.groupName}
             defaultOpen={true}
             title={<span className="font-bold text-sm tracking-wide uppercase">{group.groupName}</span>}
             summary={
                <div className="flex items-center gap-4 text-xs text-muted-foreground mr-2">
                    <span className="bg-background px-2 py-1 rounded-md border font-mono">Usos: {group.totalUses}</span>
                    {(group.totalARS > 0 || group.totalUSD === 0) && (
                        <span className={cn("font-medium", type === 'income' ? "text-income" : "text-expense")}>
                            {formatMoney(group.totalARS, { id: 'ars', code: 'ARS', symbol: '$', name: 'Pesos' } as any)}
                        </span>
                    )}
                    {group.totalUSD > 0 && (
                        <span className={cn("font-medium", type === 'income' ? "text-income" : "text-expense")}>
                            {formatMoney(group.totalUSD, { id: 'usd', code: 'USD', symbol: 'US$', name: 'Dólares' } as any)}
                        </span>
                    )}
                </div>
             }
          >
              <div className="flex flex-col space-y-1">
                  {group.cats.map((cat: any) => {
                      const Icon = cat.icon ? getIcon(cat.icon) : getIcon('folder');
                      const s = cat.stats;
                      return (
                          <div 
                              key={cat.id}
                              onClick={() => openSheet('edit-category', { category: cat })}
                              className="group flex items-center justify-between p-3 rounded-lg hover:bg-accent/40 cursor-pointer transition-colors border border-transparent hover:border-border/50"
                          >
                              <div className="flex items-center gap-4 min-w-0 flex-1">
                                  <div
                                     className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                                     style={{ backgroundColor: `${cat.color || (type === 'income' ? '#10b981' : '#8b5cf6')}20` }}
                                   >
                                     <Icon className="w-5 h-5" style={{ color: cat.color || (type === 'income' ? '#10b981' : '#8b5cf6') }} />
                                   </div>
                                   <div className="min-w-0">
                                       <p className="font-semibold text-sm truncate text-foreground">{cat.name}</p>
                                       <p className="text-xs text-muted-foreground/70 truncate">{cat.is_default ? 'Categoría de Sistema' : 'Categoría Personalizada'}</p>
                                   </div>
                              </div>
                              
                              <div className="flex items-center gap-6 text-right">
                                  <div className="hidden sm:flex flex-col text-xs text-muted-foreground font-mono">
                                      <span>Usos: {s.uses}</span>
                                  </div>
                                  <div className="flex flex-col text-sm font-medium items-end min-w-[80px]">
                                      {(s.ARS > 0 || s.USD === 0) && (
                                          <span>{formatMoney(s.ARS, { id: 'ars', code: 'ARS', symbol: '$', name: 'Pesos' } as any)}</span>
                                      )}
                                      {s.USD > 0 && (
                                          <span className="text-muted-foreground">{formatMoney(s.USD, { id: 'usd', code: 'USD', symbol: 'US$', name: 'Dólares' } as any)}</span>
                                      )}
                                  </div>
                                  {!cat.is_default && (
                                      <button
                                          onClick={(e) => {
                                              e.stopPropagation();
                                              removeCategory(cat.id);
                                          }}
                                          className="opacity-0 group-hover:opacity-100 p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                                      >
                                          <Trash2 className="w-4 h-4" />
                                      </button>
                                  )}
                                  {cat.is_default && (
                                      <div className="w-8" /> /* placeholder for alignment */
                                  )}
                              </div>
                          </div>
                      );
                  })}
              </div>
          </SimpleAccordion>
      );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Listado de Categorías</h1>
        <Button size="sm" className="gap-2" onClick={() => openSheet('new-category')}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva Categoría</span>
        </Button>
      </div>

      {/* Expense Categories */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 pb-2">
        <div className="flex items-center gap-2 mb-4 pl-1">
          <Badge variant="secondary" className="bg-expense/15 text-expense border-none px-3 py-1 text-sm">
            Egresos
          </Badge>
          <span className="text-xs text-muted-foreground">Macrogrupos y Categorías</span>
        </div>
        
        <div className="space-y-3">
             {expenses.map(g => renderGroup(g, 'expense'))}
        </div>
      </div>

      {/* Income Categories */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
        <div className="flex items-center gap-2 mb-4 pl-1">
          <Badge variant="secondary" className="bg-income/15 text-income border-none px-3 py-1 text-sm">
            Ingresos
          </Badge>
          <span className="text-xs text-muted-foreground">Macrogrupos y Categorías</span>
        </div>
        
        <div className="space-y-3">
             {incomes.map(g => renderGroup(g, 'income'))}
        </div>
      </div>
    </div>
  );
}
