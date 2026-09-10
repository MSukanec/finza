'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AXIS,
  CURSOR_BAR,
  ChartCard,
  ChartEmpty,
  ChartLegend,
  ChartTooltip,
  GRID,
  SERIES,
  TONE,
  compactNumber,
  topNWithOther,
  CHART_CONTAINER,
} from '@/components/charts/chart-kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoney } from '@/lib/money';
import { METRICS, fullDate, type Bucket, type Metric, type Slice } from '../use-report-data';
import type { Currency } from '@/lib/types';
import {
  ArrowLeftRight,
  Layers,
  Scale,
  TrendingUp,
  Wallet,
  Tags,
  LineChart as LineChartIcon,
} from 'lucide-react';

const METRIC_LABEL: Record<Metric, string> = {
  income: 'Ingresos',
  expense: 'Egresos',
  net: 'Neto',
};

/** Fecha del cubo, para el encabezado del tooltip. */
const bucketHeading = (_label: unknown, payload?: any[]) => {
  const d = payload?.[0]?.payload?.date as Date | undefined;
  return d ? fullDate(d) : String(_label ?? '');
};

// ============================================================ 1. Evolución

export function EvolutionChart({
  buckets,
  metric,
  onMetricChange,
  currency,
  showAvg,
  window,
  onWindowChange,
}: {
  buckets: Bucket[];
  metric: Metric;
  /** La métrica sólo afecta a esta tarjeta, así que el selector vive acá. */
  onMetricChange: (m: Metric) => void;
  currency: Currency;
  showAvg: boolean;
  window: [number, number] | null;
  onWindowChange: (w: [number, number] | null) => void;
}) {
  // Se acota en el render, no en un efecto: al cambiar un filtro el array nuevo
  // puede ser más corto que la ventana guardada, y el Brush calculaba NaN con
  // los índices viejos durante ese render intermedio.
  const maxIndex = Math.max(0, buckets.length - 1);
  const start = Math.min(Math.max(0, window?.[0] ?? 0), maxIndex);
  const end = Math.min(Math.max(start, window?.[1] ?? maxIndex), maxIndex);

  const visible = buckets.slice(start, end + 1);
  const total = visible.reduce((s, b) => s + b.value, 0);
  const hasNegative = visible.some((b) => b.value < 0);

  const legend = showAvg
    ? [
        { label: METRIC_LABEL[metric], color: TONE.neutral },
        { label: 'Promedio móvil', color: 'var(--primary)' },
      ]
    : [];

  return (
    <ChartCard
      title="Evolución"
      subtitle={
        visible.length
          ? `${fullDate(visible[0].date)} — ${fullDate(visible[visible.length - 1].date)}`
          : undefined
      }
      icon={LineChartIcon}
      legend={<ChartLegend items={legend} />}
      actions={
        <>
          {window && (
            <button
              onClick={() => onWindowChange(null)}
              className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Ver todo
            </button>
          )}
          <Select value={metric} onValueChange={(v) => v && onMetricChange(v as Metric)}>
            <SelectTrigger className="h-8 w-[112px] text-xs">
              <SelectValue>{METRICS.find((m) => m.id === metric)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
    >
      <p className="mb-4 text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
        {formatMoney(total, currency)}
      </p>

      <div className="h-[300px] w-full">
        {buckets.length === 0 ? (
          <ChartEmpty />
        ) : (
          <ResponsiveContainer {...CHART_CONTAINER}>
            <ComposedChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={28} />
              <YAxis orientation="right" width={56} {...AXIS} tickFormatter={compactNumber} />
              {hasNegative && <ReferenceLine y={0} stroke="var(--border)" />}
              <Tooltip
                cursor={CURSOR_BAR}
                content={
                  <ChartTooltip
                    currency={currency}
                    labelFormatter={bucketHeading}
                    nameFormatter={(n) => (n === 'avg' ? 'Promedio' : METRIC_LABEL[metric])}
                  />
                }
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                {buckets.map((b, i) => (
                  <Cell
                    key={i}
                    // El negativo se distingue por posición (bajo el cero); el
                    // tono es refuerzo, no la única señal.
                    fill={b.value < 0 ? TONE.expense : TONE.neutral}
                    fillOpacity={i >= start && i <= end ? 1 : 0.18}
                  />
                ))}
              </Bar>
              {showAvg && (
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
              {/* Con un solo período el Brush divide por (length - 1) = 0 y sale NaN
                  en la posición de las manijas. Además no habría nada que acotar. */}
              {buckets.length > 1 && (
              <Brush
                dataKey="label"
                height={26}
                travellerWidth={8}
                stroke="var(--border)"
                fill="var(--muted)"
                tickFormatter={() => ''}
                startIndex={start}
                endIndex={end}
                onChange={(r: any) => {
                  if (typeof r?.startIndex === 'number' && typeof r?.endIndex === 'number') {
                    onWindowChange([r.startIndex, r.endIndex]);
                  }
                }}
              />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

// ============================================================ 2. Ingresos vs egresos

export function IncomeVsExpenseChart({ buckets, currency }: { buckets: Bucket[]; currency: Currency }) {
  return (
    <ChartCard
      title="Ingresos vs egresos"
      icon={ArrowLeftRight}
      legend={
        <ChartLegend
          items={[
            { label: 'Ingresos', color: TONE.income },
            { label: 'Egresos', color: TONE.expense },
          ]}
        />
      }
    >
      <div className="h-[260px] w-full">
        {buckets.length === 0 ? (
          <ChartEmpty />
        ) : (
          <ResponsiveContainer {...CHART_CONTAINER}>
            <BarChart data={buckets} margin={{ top: 4, right: 8, bottom: 0, left: 8 }} barGap={2}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={28} />
              <YAxis orientation="right" width={56} {...AXIS} tickFormatter={compactNumber} />
              <Tooltip
                cursor={CURSOR_BAR}
                content={<ChartTooltip currency={currency} labelFormatter={bucketHeading} />}
              />
              <Bar dataKey="income" name="Ingresos" fill={TONE.income} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              <Bar dataKey="expense" name="Egresos" fill={TONE.expense} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

// ============================================================ 3. Resultado por período

export function NetChart({ buckets, currency }: { buckets: Bucket[]; currency: Currency }) {
  return (
    <ChartCard title="Resultado por período" subtitle="Ingresos menos egresos" icon={Scale}>
      <div className="h-[260px] w-full">
        {buckets.length === 0 ? (
          <ChartEmpty />
        ) : (
          <ResponsiveContainer {...CHART_CONTAINER}>
            <BarChart data={buckets} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={28} />
              <YAxis orientation="right" width={56} {...AXIS} tickFormatter={compactNumber} />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Tooltip
                cursor={CURSOR_BAR}
                content={<ChartTooltip currency={currency} labelFormatter={bucketHeading} hideName />}
              />
              <Bar dataKey="net" name="Neto" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                {buckets.map((b, i) => (
                  <Cell key={i} fill={b.net >= 0 ? TONE.income : TONE.expense} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

// ============================================================ 4. Balance acumulado

export function CumulativeChart({ buckets, currency }: { buckets: Bucket[]; currency: Currency }) {
  const hasNegative = buckets.some((b) => b.cumulative < 0);
  return (
    <ChartCard
      title="Balance acumulado"
      subtitle="Cómo se apila el resultado período a período"
      icon={TrendingUp}
    >
      <div className="h-[260px] w-full">
        {buckets.length === 0 ? (
          <ChartEmpty />
        ) : (
          <ResponsiveContainer {...CHART_CONTAINER}>
            <AreaChart data={buckets} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="rep-cumulative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={28} />
              <YAxis orientation="right" width={56} {...AXIS} tickFormatter={compactNumber} />
              {hasNegative && <ReferenceLine y={0} stroke="var(--border)" />}
              <Tooltip
                cursor={{ stroke: 'var(--border)' }}
                content={<ChartTooltip currency={currency} labelFormatter={bucketHeading} hideName />}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                name="Acumulado"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#rep-cumulative)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

// ============================================================ 5. Rankings

/**
 * Barras horizontales para rankear. Se prefiere a una torta: comparar largos es
 * mucho más preciso que comparar ángulos, y el nombre va escrito al lado en vez
 * de depender de una leyenda.
 */
export function RankingChart({
  title,
  subtitle,
  icon,
  slices,
  currency,
  colorful,
}: {
  title: string;
  subtitle?: string;
  /** Obligatorio: toda tarjeta de la app lleva ícono a la izquierda del título. */
  icon: React.ElementType;
  slices: Slice[];
  currency: Currency;
  /** Colorea las primeras 5; el resto queda en tinta. Sólo donde la identidad importa. */
  colorful?: boolean;
}) {
  const data = topNWithOther(slices, 8, (value, count) => ({
    key: 'other',
    name: `Otros (${count})`,
    value,
  }));
  const max = data[0]?.value ?? 1;
  const total = slices.reduce((s, i) => s + i.value, 0);

  return (
    <ChartCard title={title} subtitle={subtitle} icon={icon}>
      {data.length === 0 ? (
        <ChartEmpty />
      ) : (
        <div className="space-y-3">
          {data.map((d, i) => {
            const share = total > 0 ? (d.value / total) * 100 : 0;
            const color = colorful && i < SERIES.length && d.key !== 'other' ? SERIES[i] : TONE.neutral;
            return (
              <div key={d.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{d.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatMoney(d.value, currency)}
                    <span className="ml-2 text-xs">{share.toFixed(1)}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${Math.max(1.5, (d.value / max) * 100)}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

// ============================================================ 6. Composición en el tiempo

export function CompositionChart({
  buckets,
  slices,
  breakdown,
  currency,
}: {
  buckets: Bucket[];
  slices: Slice[];
  /** Por cubo: cuánto de cada grupo. */
  breakdown: Record<string, number>[];
  currency: Currency;
}) {
  const top = topNWithOther(slices, 6, (value, count) => ({
    key: 'other',
    name: `Otros (${count})`,
    value,
  }));

  const data = buckets.map((b, i) => ({ label: b.label, date: b.date, ...breakdown[i] }));
  const legend = top.map((t, i) => ({
    label: t.name,
    color: t.key === 'other' ? TONE.muted : SERIES[i % SERIES.length],
  }));

  return (
    <ChartCard
      title="Composición del gasto"
      subtitle="Cómo se reparte el egreso entre grupos, período a período"
      icon={Layers}
      legend={<ChartLegend items={legend} />}
    >
      <div className="h-[280px] w-full">
        {buckets.length === 0 ? (
          <ChartEmpty />
        ) : (
          <ResponsiveContainer {...CHART_CONTAINER}>
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={28} />
              <YAxis orientation="right" width={56} {...AXIS} tickFormatter={compactNumber} />
              <Tooltip
                cursor={CURSOR_BAR}
                content={<ChartTooltip currency={currency} labelFormatter={bucketHeading} />}
              />
              {top.map((t, i) => (
                <Bar
                  key={t.key}
                  dataKey={t.key}
                  name={t.name}
                  stackId="composition"
                  fill={t.key === 'other' ? TONE.muted : SERIES[i % SERIES.length]}
                  isAnimationActive={false}
                  maxBarSize={28}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}
