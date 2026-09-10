'use client';

import { useEffect, useRef, useState } from 'react';
import { BarChart3, Scale, TrendingDown, TrendingUp, PiggyBank, Tags, Layers, Wallet } from 'lucide-react';
import { PageLayout } from '@/components/layout/page-layout';
import { formatMoney } from '@/lib/money';
import { Kpi } from '@/components/ui/panel';
import { GRAINS, useReportData, type ReportFilters as Filters } from '../use-report-data';
import { ReportFilters, presetRange, type Preset } from '../components/report-filters';
import {
  CompositionChart,
  CumulativeChart,
  EvolutionChart,
  IncomeVsExpenseChart,
  NetChart,
  RankingChart,
} from '../components/report-charts';

export function ReportsView() {
  const [preset, setPreset] = useState<Preset>('12m');
  const [filters, setFilters] = useState<Filters>(() => ({
    grain: 'month',
    metric: 'net',
    ...presetRange('12m'),
    walletId: 'all',
    groupId: 'all',
  }));
  const [window, setWindow] = useState<[number, number] | null>(null);

  const data = useReportData(filters);

  const patch = (p: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...p }));

  const handlePreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') patch(presetRange(p));
  };

  // Los índices del scrubber dejan de significar lo mismo si cambia el recorte.
  const signature = `${filters.grain}|${filters.from?.getTime()}|${filters.to?.getTime()}|${filters.walletId}|${filters.groupId}`;
  const sigRef = useRef(signature);
  useEffect(() => {
    if (sigRef.current !== signature) {
      sigRef.current = signature;
      setWindow(null);
    }
  }, [signature]);

  const showAvg = GRAINS.find((g) => g.id === filters.grain)!.avgWindow > 1;

  return (
    <PageLayout
      title="Reportes"
      icon={BarChart3}
      actions={
        <ReportFilters
          filters={filters}
          preset={preset}
          onChange={patch}
          onPresetChange={handlePreset}
          resultCount={data.count}
        />
      }
    >
      {/* KPIs del recorte */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={TrendingUp}
          label="Ingresos"
          value={formatMoney(data.totalIncome, data.currency)}
          tone="income"
        />
        <Kpi
          icon={TrendingDown}
          label="Egresos"
          value={formatMoney(data.totalExpense, data.currency)}
          tone="expense"
        />
        <Kpi
          icon={Scale}
          label="Resultado"
          value={formatMoney(data.net, data.currency)}
          tone={data.net >= 0 ? 'income' : 'expense'}
        />
        <Kpi
          icon={PiggyBank}
          label="Tasa de ahorro"
          value={data.savingsRate === null ? '—' : `${data.savingsRate.toFixed(1)}%`}
          hint={data.savingsRate === null ? 'Sin ingresos en el período' : 'Del total que entró'}
          tone={data.savingsRate !== null && data.savingsRate < 0 ? 'expense' : 'neutral'}
        />
      </div>

      <EvolutionChart
        buckets={data.buckets}
        metric={filters.metric}
        onMetricChange={(m) => patch({ metric: m })}
        currency={data.currency}
        showAvg={showAvg}
        window={window}
        onWindowChange={setWindow}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <IncomeVsExpenseChart buckets={data.buckets} currency={data.currency} />
        <NetChart buckets={data.buckets} currency={data.currency} />
      </div>

      <CumulativeChart buckets={data.buckets} currency={data.currency} />

      <CompositionChart
        buckets={data.buckets}
        slices={data.byGroup}
        breakdown={data.groupBreakdown}
        currency={data.currency}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <RankingChart
          title="Gasto por categoría"
          subtitle="Las que más pesan en el período"
          icon={Tags}
          slices={data.byCategory}
          currency={data.currency}
          colorful
        />
        <RankingChart
          title="Gasto por grupo"
          icon={Layers}
          slices={data.byGroup}
          currency={data.currency}
          colorful
        />
        <RankingChart
          title="Gasto por billetera"
          subtitle="De dónde salió la plata"
          icon={Wallet}
          slices={data.byWallet}
          currency={data.currency}
        />
      </div>
    </PageLayout>
  );
}
