'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { useUIStore } from '@/stores/ui-store';
import { getIcon } from '@/lib/icons';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';

export function CategoriesView() {
  const categories = useFinanceStore((s) => s.categories);
  const removeCategory = useFinanceStore((s) => s.removeCategory);
  const openSheet = useUIStore((s) => s.openSheet);

  const incomeCategories = categories.filter((c) => c.type === 'income');
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Categorías</h1>
        <Button size="sm" className="gap-2" onClick={() => openSheet('new-category')}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva</span>
        </Button>
      </div>

      {/* Expense Categories */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="bg-expense/15 text-expense border-none">
            Gastos
          </Badge>
          <span className="text-xs text-muted-foreground">{expenseCategories.length} categorías</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 stagger-children">
          {expenseCategories.map((cat) => {
            const Icon = cat.icon ? getIcon(cat.icon) : getIcon('folder');
            return (
              <Card 
                key={cat.id} 
                className="border-border/50 group hover:border-border transition-colors cursor-pointer"
                onClick={() => openSheet('edit-category', { category: cat })}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${cat.color || '#8b5cf6'}20` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: cat.color || '#8b5cf6' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cat.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {cat.group_name || 'General'} · {cat.is_default ? 'Por defecto' : 'Personalizada'}
                    </p>
                  </div>
                  {!cat.is_default && (
                    <button
                      onClick={(e) => {
                         e.stopPropagation();
                         removeCategory(cat.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Income Categories */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="bg-income/15 text-income border-none">
            Ingresos
          </Badge>
          <span className="text-xs text-muted-foreground">{incomeCategories.length} categorías</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 stagger-children">
          {incomeCategories.map((cat) => {
            const Icon = cat.icon ? getIcon(cat.icon) : getIcon('folder');
            return (
              <Card 
                key={cat.id} 
                className="border-border/50 group hover:border-border transition-colors cursor-pointer"
                onClick={() => openSheet('edit-category', { category: cat })}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${cat.color || '#10b981'}20` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: cat.color || '#10b981' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cat.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {cat.group_name || 'General'} · {cat.is_default ? 'Por defecto' : 'Personalizada'}
                    </p>
                  </div>
                  {!cat.is_default && (
                    <button
                      onClick={(e) => {
                         e.stopPropagation();
                         removeCategory(cat.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
