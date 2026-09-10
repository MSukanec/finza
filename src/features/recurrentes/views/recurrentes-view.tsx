'use client';

import { useFinanceStore } from '@/stores/finance-store';
import { useUIStore } from '@/stores/ui-store';
import { useMemo, useState } from 'react';
import { Panel, Kpi } from '@/components/ui/panel';
import { Picker } from '@/components/ui/picker';
import { Repeat, ChevronDown, ChevronRight, Plus, Calendar, Layers, ArrowDownUp , CalendarDays } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { PageLayout } from '@/components/layout/page-layout';
import { parseLocalDate, cn } from '@/lib/utils';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const GRID = 'grid grid-cols-[minmax(150px,1.4fr)_repeat(12,minmax(2.75rem,1fr))] gap-1';

const formatStrCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency.toUpperCase() || 'ARS' }).format(amount);

const formatCell = (amount: number, currency: string) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency.toUpperCase() || 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

type Cell = { amount: number; txs: any[] };

export function RecurrentesView() {
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const primaryCurrencyId = useFinanceStore((s) => s.primaryCurrencyId);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const openSheet = useUIStore((s) => s.openSheet);

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const now = new Date();
  const isCurrentYear = parseInt(selectedYear, 10) === now.getFullYear();
  const currentMonthIdx = now.getMonth();

  const recurringCategories = useMemo(
    () => categories.filter((c) => c.is_recurring),
    [categories]
  );

  // Matrix: per category, 12 cells with amount (converted) + the actual transactions
  const cells = useMemo(() => {
    const data: Record<string, Cell[]> = {};
    for (const cat of recurringCategories) {
      data[cat.id] = Array.from({ length: 12 }, () => ({ amount: 0, txs: [] as any[] }));
    }

    const relevant = transactions.filter(
      (t) => t.type === 'expense' && t.category_id && data[t.category_id]
    );

    for (const tx of relevant) {
      let month = -1;
      let year = '';
      if (tx.period_month) {
        const [y, m] = tx.period_month.split('-');
        year = y;
        month = parseInt(m, 10) - 1;
      } else {
        const d = parseLocalDate(tx.date);
        year = d.getFullYear().toString();
        month = d.getMonth();
      }
      if (year !== selectedYear || month < 0 || month > 11) continue;

      let amount = tx.amount;
      if (tx.currency_id !== primaryCurrencyId) {
        const txRate = exchangeRates[tx.currency_id] || 1;
        const baseRate = exchangeRates[primaryCurrencyId] || 1;
        amount = amount * (baseRate / txRate);
      }
      const cell = data[tx.category_id!][month];
      cell.amount += amount;
      cell.txs.push(tx);
    }
    return data;
  }, [transactions, recurringCategories, selectedYear, primaryCurrencyId, exchangeRates]);

  const catTotal = (catId: string) => cells[catId]?.reduce((a, c) => a + c.amount, 0) ?? 0;

  const monthlyTotals = useMemo(() => {
    const totals = new Array(12).fill(0);
    Object.values(cells).forEach((row) => row.forEach((c, i) => (totals[i] += c.amount)));
    return totals;
  }, [cells]);

  const globalTotal = useMemo(() => monthlyTotals.reduce((a, b) => a + b, 0), [monthlyTotals]);

  // Grouped view: groups sorted by spend desc; categories within sorted by spend desc
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; cats: any[]; monthly: number[]; total: number }>();
    for (const cat of recurringCategories) {
      const name = cat.group_name || 'General';
      if (!map.has(name)) map.set(name, { name, cats: [], monthly: new Array(12).fill(0), total: 0 });
      const g = map.get(name)!;
      g.cats.push(cat);
      (cells[cat.id] || []).forEach((c, i) => {
        g.monthly[i] += c.amount;
        g.total += c.amount;
      });
    }
    const arr = Array.from(map.values());
    arr.forEach((g) => g.cats.sort((a, b) => catTotal(b.id) - catTotal(a.id) || a.name.localeCompare(b.name)));
    arr.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return arr;
  }, [recurringCategories, cells]);

  const flatCats = useMemo(
    () => [...recurringCategories].sort((a, b) => a.name.localeCompare(b.name)),
    [recurringCategories]
  );

  const yearsOptions = useMemo(() => {
    const years = new Set<string>([now.getFullYear().toString()]);
    transactions.forEach((t) => {
      if (t.period_month) years.add(t.period_month.split('-')[0]);
      else years.add(parseLocalDate(t.date).getFullYear().toString());
    });
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [transactions]);

  const toggleGroup = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const handleCellClick = (cat: any, monthIdx: number, cell: Cell) => {
    const mm = String(monthIdx + 1).padStart(2, '0');
    const period = `${selectedYear}-${mm}`;
    if (cell.txs.length > 0) {
      const tx = [...cell.txs].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0];
      openSheet('edit-transaction', { transaction: tx });
    } else {
      const isCurrent = isCurrentYear && monthIdx === currentMonthIdx;
      const date = isCurrent ? now.toISOString().split('T')[0] : `${selectedYear}-${mm}-01`;
      openSheet('new-transaction', {
        type: cat.type === 'income' ? 'income' : 'expense',
        categoryId: cat.id,
        groupName: cat.group_name || 'General',
        periodMonth: period,
        description: cat.name,
        date,
      });
    }
  };

  // --- Renderers ---
  const renderCategoryRow = (cat: any) => {
    const row = cells[cat.id] || [];
    const total = catTotal(cat.id);
    return (
      <div key={cat.id} className={cn(GRID, 'group items-stretch rounded-xl hover:bg-accent/40 transition-colors')}>
        <div className="min-w-0 flex flex-col justify-center py-2 pl-3 pr-2">
          <span className="font-medium text-sm truncate" title={cat.name}>{cat.name}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {total > 0 ? formatStrCurrency(total, primaryCurrencyId) + ' / año' : 'Sin pagos'}
          </span>
        </div>
        {row.map((cell, idx) => {
          const isEmpty = cell.amount === 0;
          const isCurrent = isCurrentYear && idx === currentMonthIdx;
          return (
            <button
              key={idx}
              onClick={() => handleCellClick(cat, idx, cell)}
              title={
                isEmpty
                  ? `Registrar ${cat.name} · ${MONTHS[idx]} ${selectedYear}`
                  : `${formatStrCurrency(cell.amount, primaryCurrencyId)} · tocá para editar`
              }
              className={cn(
                'relative min-h-[42px] rounded-lg flex items-center justify-center text-[11px] font-semibold tabular-nums transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                isEmpty
                  ? 'border border-dashed border-border/60 text-muted-foreground/0 hover:border-primary/40 hover:bg-accent/60'
                  : 'bg-expense/12 text-expense hover:bg-expense/20',
                isCurrent && isEmpty && 'border-primary/30 bg-accent/30',
                isCurrent && !isEmpty && 'ring-1 ring-expense/30'
              )}
            >
              {isEmpty ? (
                <Plus className="size-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />
              ) : (
                formatCell(cell.amount, primaryCurrencyId)
              )}
            </button>
          );
        })}
      </div>
    );
  };

  /**
   * En mobile la matriz de 12 columnas no entra: obligaba a scrollear en
   * horizontal por 840px. Misma información y mismas acciones, pero una tarjeta
   * por categoría con los meses en grilla de 6x2.
   */
  const mobileList = (
    <div className="space-y-3 p-3 md:hidden">
      {flatCats.map((cat: any) => {
        const row = cells[cat.id] || [];
        const total = catTotal(cat.id);
        return (
          <div key={cat.id} className="rounded-2xl bg-card p-3 shadow-soft-xs">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium">{cat.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {total > 0 ? formatStrCurrency(total, primaryCurrencyId) : 'Sin pagos'}
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1">
              {row.map((cell: any, idx: number) => {
                const isEmpty = cell.amount === 0;
                const isCurrent = isCurrentYear && idx === currentMonthIdx;
                return (
                  <button
                    key={idx}
                    onClick={() => handleCellClick(cat, idx, cell)}
                    aria-label={`${cat.name} · ${MONTHS[idx]} ${selectedYear}`}
                    className={cn(
                      'flex min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-semibold tabular-nums transition-colors',
                      isEmpty
                        ? 'border border-dashed border-border/60 text-muted-foreground'
                        : 'bg-expense/12 text-expense',
                      isCurrent && 'ring-1 ring-primary/40'
                    )}
                  >
                    <span className="text-[9px] font-medium opacity-60">{MONTHS[idx]}</span>
                    {isEmpty ? <Plus className="size-3 opacity-50" /> : formatCell(cell.amount, primaryCurrencyId)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const monthHeader = (
    <div className={cn(GRID, 'mb-1 sticky top-0')}>
      <div className="flex items-end pl-3 pb-2 text-xs font-medium text-muted-foreground">Concepto</div>
      {MONTHS.map((m, idx) => {
        const isCurrent = isCurrentYear && idx === currentMonthIdx;
        return (
          <div
            key={m}
            className={cn(
              'flex items-end justify-center pb-2 text-[11px] font-medium',
              isCurrent ? 'text-primary font-semibold' : 'text-muted-foreground'
            )}
          >
            {m}
          </div>
        );
      })}
    </div>
  );

  return (
    <PageLayout
      title="Gastos recurrentes"
      description="Tu mapa anual de pagos fijos. Tocá una celda para registrarlo o editarlo."
      icon={Repeat}
      actions={
        <div className="flex items-center gap-2">
          <div className="hidden h-9 shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5 md:inline-flex">
            <button
              onClick={() => setViewMode('grouped')}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                viewMode === 'grouped'
                  ? 'bg-card text-foreground shadow-soft-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Layers className="size-3.5" /> Por categoría
            </button>
            <button
              onClick={() => setViewMode('flat')}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                viewMode === 'flat'
                  ? 'bg-card text-foreground shadow-soft-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ArrowDownUp className="size-3.5" /> Alfabético
            </button>
          </div>
          <Calendar className="size-4 text-muted-foreground" />
          <Picker
            value={selectedYear}
            onValueChange={setSelectedYear}
            options={yearsOptions.map((y) => ({ value: y, label: y }))}
            className="w-[96px]"
          />
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          icon={Repeat}
          label="Gasto fijo anual"
          value={formatStrCurrency(globalTotal, primaryCurrencyId)}
        />
        <Kpi
          icon={CalendarDays}
          label="Promedio mensual"
          value={formatStrCurrency(globalTotal / 12, primaryCurrencyId)}
        />
        <Kpi
          icon={Layers}
          label="Conceptos recurrentes"
          value={String(recurringCategories.length)}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* Map */}
      <Panel
        icon={CalendarDays}
        title={`Mapa de pagos ${selectedYear}`}
        description={`Moneda base: ${primaryCurrencyId.toUpperCase()}`}
        padded={false}
      >
          {recurringCategories.length === 0 ? (
            <div className="m-4 rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">
              No tenés categorías marcadas como recurrentes.<br />
              Editá una categoría y activá “Es recurrente”.
            </div>
          ) : (
            <>
            {mobileList}
            <ScrollArea className="hidden w-full md:block">
              <div className="min-w-[840px] p-4">
                {monthHeader}

                {viewMode === 'grouped' ? (
                  <div className="space-y-2 mt-1">
                    {groups.map((g) => {
                      const isCollapsed = collapsed.has(g.name);
                      return (
                        <div key={g.name} className="rounded-xl overflow-hidden">
                          {/* Group header row */}
                          <button
                            onClick={() => toggleGroup(g.name)}
                            className={cn(GRID, 'w-full items-center bg-accent/50 hover:bg-accent transition-colors rounded-xl text-left')}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 py-2.5 pl-2 pr-2">
                              {isCollapsed ? (
                                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                              )}
                              <span className="font-semibold text-sm truncate">{g.name}</span>
                              <span className="text-[11px] text-muted-foreground shrink-0">({g.cats.length})</span>
                            </div>
                            {g.monthly.map((amount, idx) => {
                              const isCurrent = isCurrentYear && idx === currentMonthIdx;
                              return (
                                <div
                                  key={idx}
                                  className={cn(
                                    'flex items-center justify-center text-[10px] font-semibold tabular-nums',
                                    amount > 0 ? 'text-foreground/70' : 'text-transparent',
                                    isCurrent && 'text-primary'
                                  )}
                                >
                                  {amount > 0 ? formatCell(amount, primaryCurrencyId) : '·'}
                                </div>
                              );
                            })}
                          </button>

                          {/* Category rows */}
                          {!isCollapsed && (
                            <div className="space-y-0.5 mt-0.5">
                              {g.cats.map((cat) => renderCategoryRow(cat))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-0.5 mt-1">
                    {flatCats.map((cat) => renderCategoryRow(cat))}
                  </div>
                )}

                {/* Footer total row */}
                <div className={cn(GRID, 'mt-3 pt-3 border-t border-border/60 items-center')}>
                  <div className="flex items-center pl-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Total mensual
                  </div>
                  {monthlyTotals.map((total, idx) => {
                    const isCurrent = isCurrentYear && idx === currentMonthIdx;
                    return (
                      <div
                        key={`total-${idx}`}
                        title={formatStrCurrency(total, primaryCurrencyId)}
                        className={cn(
                          'flex items-center justify-center font-semibold tabular-nums text-[10px] rounded-lg py-2 truncate',
                          total > 0 ? 'bg-accent/60 text-foreground' : 'text-muted-foreground/40',
                          isCurrent && total > 0 && 'ring-1 ring-primary/30'
                        )}
                      >
                        {total > 0 ? formatCell(total, primaryCurrencyId) : '-'}
                      </div>
                    );
                  })}
                </div>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            </>
          )}
      </Panel>
    </PageLayout>
  );
}
