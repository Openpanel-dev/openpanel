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
  /** Interval drives the hover-label date format. */
  interval?: IInterval;
  /** Range drives the default label ("Last 30 days") and dashed-tail logic. */
  range?: keyof typeof timeWindows;
}

export function OverviewMetricCard({
  id,
  data,
  metric,
  unit,
  label,
  onClick,
  active,
  inverted = false,
  isLoading = false,
  interval = 'day',
  range,
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

  return (
    <MetricCardShell active={active} onClick={onClick}>
      <div className="px-3 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <span className="truncate font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
          {isLoading ? null : (
            <PreviousDiffIndicatorPure
              {...diff}
              inverted={inverted}
              size="xs"
            />
          )}
        </div>
        <div className="mt-1 flex items-baseline gap-0.5 leading-none">
          {isLoading ? (
            <Skeleton className="h-5 w-20" />
          ) : (
            <MetricValue unit={unit} value={displayValue} />
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground leading-none">
          {displayLabel}
        </div>
      </div>

      <div className="mt-1.5 h-[40px]">
        {data.length > 0 && (
          <BarChart
            animationDuration={0}
            aspectRatio="auto"
            barGap={0.25}
            className="h-full"
            data={data}
            margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
            xDataKey="date"
          >
            <OPStatHoverBridge onHoverChange={setHover} />
            <Bar
              animate={false}
              dataKey="current"
              fadedOpacity={0.35}
              fill={PRIMARY_COLOR}
              lineCap={1}
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
  'truncate font-mono font-semibold text-xl text-foreground tracking-tight tabular-nums';

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
    return (
      <span className={VALUE_CLASS}>
        {number.currency(value / 100, { short: true })}
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

  return <span className={VALUE_CLASS}>{number.short(value)}</span>;
}
