import { FilterIcon, RotateCcwIcon } from 'lucide-react';
import { useState } from 'react';
import { DeltaChip } from '../delta-chip';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';

function formatWindowKind(windowKind: string): string {
  switch (windowKind) {
    case 'yesterday':
      return 'Yesterday';
    case 'rolling_7d':
      return '7 Days';
    case 'rolling_30d':
      return '30 Days';
  }
  return windowKind;
}

interface InsightCardProps {
  insight: RouterOutputs['insight']['list'][number];
  className?: string;
  onFilter?: () => void;
}

export function InsightCard({
  insight,
  className,
  onFilter,
}: InsightCardProps) {
  const payload = insight.payload;
  const dimensions = payload?.dimensions;
  const availableMetrics = Object.entries(payload?.metrics ?? {});

  // Pick what to display: prefer share if available (geo/devices), else primaryMetric
  const [metricIndex, setMetricIndex] = useState(
    availableMetrics.findIndex(([key]) => key === payload?.primaryMetric)
  );
  const currentMetricKey = availableMetrics[metricIndex][0];
  const currentMetricEntry = availableMetrics[metricIndex][1];

  const metricUnit = currentMetricEntry?.unit;
  const currentValue = currentMetricEntry?.current ?? null;
  const compareValue = currentMetricEntry?.compare ?? null;

  const direction = currentMetricEntry?.direction ?? 'flat';
  const isIncrease = direction === 'up';
  const isDecrease = direction === 'down';

  const deltaText =
    metricUnit === 'ratio'
      ? `${Math.abs((currentMetricEntry?.delta ?? 0) * 100).toFixed(1)}pp`
      : `${Math.abs((currentMetricEntry?.changePct ?? 0) * 100).toFixed(1)}%`;

  // Format metric values
  const formatValue = (value: number | null): string => {
    if (value == null) {
      return '-';
    }
    if (metricUnit === 'ratio') {
      return `${(value * 100).toFixed(1)}%`;
    }
    return Math.round(value).toLocaleString();
  };

  // Get the metric label
  const metricKeyToLabel = (key: string) =>
    key === 'share' ? 'Share' : key === 'pageviews' ? 'Pageviews' : 'Sessions';

  const metricLabel = metricKeyToLabel(currentMetricKey);

  const renderTitle = () => {
    if (
      dimensions[0]?.key === 'country' ||
      dimensions[0]?.key === 'referrer_name' ||
      dimensions[0]?.key === 'device'
    ) {
      return (
        <span className="flex items-center gap-2 capitalize">
          <SerieIcon name={dimensions[0]?.value} /> {insight.displayName}
        </span>
      );
    }

    if (insight.displayName.startsWith('http')) {
      return (
        <span className="flex items-center gap-2">
          <SerieIcon
            name={dimensions[0]?.displayName ?? dimensions[0]?.value}
          />
          <span className="line-clamp-2">{dimensions[1]?.displayName}</span>
        </span>
      );
    }

    return insight.displayName;
  };

  const openDetails = () => pushModal('InsightDetails', { insight });

  return (
    <div
      className={cn(
        'card group/card flex h-full cursor-pointer flex-col p-3 transition-colors hover:bg-def-50',
        className
      )}
      onClick={openDetails}
      onKeyDown={(event) => {
        // The metric and filter buttons handle their own keys.
        if (event.target !== event.currentTarget) {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetails();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 truncate font-semibold text-sm">
          {renderTitle()}
        </div>
        <div
          className={cn(
            'shrink-0 text-2xs text-muted-foreground',
            onFilter && 'group-focus-within/card:hidden group-hover/card:hidden'
          )}
        >
          {formatWindowKind(insight.windowKind)}
        </div>
        {onFilter && (
          <div className="hidden shrink-0 items-center gap-2 group-focus-within/card:flex group-hover/card:flex">
            {availableMetrics.length > 1 && (
              <button
                className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  setMetricIndex((metricIndex + 1) % availableMetrics.length);
                }}
                type="button"
              >
                <RotateCcwIcon className="size-2.5" />
                {metricKeyToLabel(
                  availableMetrics[
                    (metricIndex + 1) % availableMetrics.length
                  ][0]
                )}
              </button>
            )}
            <button
              className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                onFilter();
              }}
              type="button"
            >
              Filter <FilterIcon className="size-2.5" />
            </button>
          </div>
        )}
      </div>

      {insight.aiSummary && (
        <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
          {insight.aiSummary}
        </p>
      )}

      <div className="mt-auto pt-3">
        <div className="flex items-baseline gap-2">
          <div className="font-semibold text-xl tabular-nums tracking-tight">
            {formatValue(currentValue)}
          </div>
          <DeltaChip
            size="sm"
            variant={isIncrease ? 'inc' : isDecrease ? 'dec' : 'default'}
          >
            {deltaText}
          </DeltaChip>
        </div>
        <div className="mt-0.5 text-2xs text-muted-foreground">
          {metricLabel}
          {compareValue != null && ` · vs ${formatValue(compareValue)}`}
        </div>
      </div>
    </div>
  );
}
