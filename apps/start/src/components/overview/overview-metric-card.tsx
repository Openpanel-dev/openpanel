import type { IInterval } from '@openpanel/core/modules/report/report.constants';
import { timeWindows } from '@openpanel/core/modules/report/report.constants';
import { type ReactNode, useState } from 'react';
import { getPreviousMetric } from '../../utils/previous-metric';
import { Bar } from '../charts/bar';
import { BarChart } from '../charts/bar-chart';
import {
  OPStatHoverBridge,
  type OPStatHoverState,
} from '../charts/op-stat-hover-bridge';
import { PreviousDiffIndicatorPure } from '../report-chart/common/previous-diff-indicator';
import { Skeleton } from '../skeleton';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { fancyMinutes, useNumber } from '@/hooks/use-numer-formatter';
import { cn } from '@/utils/cn';
import { formatDate as formatAbsoluteDate, timeAgo } from '@/utils/date';

const PRIMARY_COLOR = 'var(--chart-0)';
const METRIC_ERROR_LABEL = 'Could not load';
// A tall card's bars get the report bars' rounding; the 40px sparkline's thin bars only a hint of it.
const BAR_RADIUS = 4;
const SPARKLINE_BAR_RADIUS = 1;
// Below this a count fits the card in full ("25,412"); above it we compact to "12M".
const FULL_NUMBER_LIMIT = 10_000_000;

export type MetricUnit = '' | 'date' | 'timeAgo' | 'min' | '%' | 'currency';

interface MetricCardProps {
  id: string;
  data: {
    current: number;
    previous?: number;
    date: string;
  }[];
  metric: {
    current: number;
    previous?: number | null;
  };
  unit?: MetricUnit;
  label: string;
  onClick?: () => void;
  active?: boolean;
  inverted?: boolean;
  isLoading?: boolean;
  /** The metric failed to load: show that instead of a value that reads as real. */
  isError?: boolean;
  /** Interval drives the hover-label date format. */
  interval?: IInterval;
  /** Range drives the default label ("Last 30 days") and dashed-tail logic. */
  range?: keyof typeof timeWindows;
  /** Stretch to the parent's height; the sparkline takes the extra room. */
  fill?: boolean;
}

export function OverviewMetricCard({
  data,
  metric,
  unit,
  label,
  onClick,
  active,
  inverted = false,
  isLoading = false,
  isError = false,
  interval = 'day',
  range,
  fill = false,
}: MetricCardProps) {
  const formatDate = useFormatDateInterval({ interval, short: false });
  const [hover, setHover] = useState<
    OPStatHoverState<{ date: string; current: number; previous?: number }>
  >({ index: null, point: null });

  const hovered = hover.point;
  const displayValue = hovered ? (hovered.current ?? 0) : metric.current;
  const displayPrev = hovered
    ? (hovered.previous ?? null)
    : (metric.previous ?? null);
  const displayLabel = hovered
    ? formatDate(new Date(hovered.date))
    : (range ? timeWindows[range]?.label : 'Total') || 'Total';

  const diff = getPreviousMetric(displayValue, displayPrev);
  const hasValue = !(isLoading || isError);

  return (
    <MetricCardShell
      active={active}
      className={cn(fill && 'h-full')}
      onClick={onClick}
    >
      <div className="px-3 pt-1.5">
        <div className="flex h-3 items-center justify-between gap-2 leading-none">
          <span className="truncate font-medium text-3xs text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
          {hasValue && (
            <PreviousDiffIndicatorPure
              {...diff}
              inverted={inverted}
              size="xs"
            />
          )}
        </div>
        <div className="my-1.5 flex items-baseline gap-0.5">
          {isLoading && <Skeleton className="h-5 w-20" />}
          {isError && <span className={VALUE_CLASS}>—</span>}
          {hasValue && <MetricValue unit={unit} value={displayValue} />}
        </div>
        <div className="mt-0.5 truncate text-2xs text-muted-foreground leading-none">
          {isError ? METRIC_ERROR_LABEL : displayLabel}
        </div>
      </div>

      <div className={cn(fill ? 'min-h-[36px] flex-1' : 'h-[36px]')}>
        {data.length > 0 && (
          <BarChart
            animationDuration={0}
            aspectRatio="auto"
            barGap={0.25}
            className="h-full"
            data={data}
            margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
            xDataKey="date"
          >
            <OPStatHoverBridge onHoverChange={setHover} />
            <Bar
              animate={false}
              dataKey="current"
              fadedOpacity={0.35}
              fill={PRIMARY_COLOR}
              lineCap={fill ? BAR_RADIUS : SPARKLINE_BAR_RADIUS}
            />
          </BarChart>
        )}
      </div>
    </MetricCardShell>
  );
}

/**
 * Outer chrome shared by the metric cards and the live histogram card —
 * fixed-height button with hover/active states and a left-bar accent. The
 * sparkline is expected to be the last child and bleed to the bottom edge.
 */
export function MetricCardShell({
  children,
  active,
  onClick,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const Tag: 'button' | 'div' = onClick ? 'button' : 'div';
  return (
    <Tag
      className={cn(
        'group relative flex flex-col overflow-hidden text-left',
        'shadow-[0_0_0_0.5px] shadow-border transition-colors',
        active ? 'bg-def-100' : 'bg-card hover:bg-def-100/50',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[2px] bg-chart-0"
        />
      )}
      {children}
    </Tag>
  );
}

const VALUE_CLASS =
  'truncate font-mono font-semibold text-foreground text-xl leading-4 tracking-tight tabular-nums';

function MetricValue({ value, unit }: { value: number; unit?: MetricUnit }) {
  const number = useNumber();

  if (unit === 'date') {
    return (
      <span className={VALUE_CLASS}>
        {value ? formatAbsoluteDate(new Date(value)) : 'N/A'}
      </span>
    );
  }

  if (unit === 'timeAgo') {
    return (
      <span className={VALUE_CLASS}>
        {value ? timeAgo(new Date(value)) : 'N/A'}
      </span>
    );
  }

  if (unit === 'min') {
    return <span className={VALUE_CLASS}>{fancyMinutes(value)}</span>;
  }

  if (unit === 'currency') {
    const amount = value / 100;
    return (
      <span className={VALUE_CLASS}>
        {number.currency(amount, {
          short: Math.abs(amount) >= FULL_NUMBER_LIMIT,
        })}
      </span>
    );
  }

  if (unit === '%') {
    return (
      <>
        <span className={VALUE_CLASS}>{number.format(value)}</span>
        <span className="font-medium font-mono text-muted-foreground text-sm">
          %
        </span>
      </>
    );
  }

  const fitsInFull = Math.abs(value) < FULL_NUMBER_LIMIT;
  return (
    <span className={VALUE_CLASS}>
      {fitsInFull ? number.format(value) : number.short(value)}
    </span>
  );
}
