import { countries } from '@/translations/countries';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import type { InsightPayload } from '@openpanel/validation';
import { ArrowDown, ArrowUp, FilterIcon, RotateCcwIcon } from 'lucide-react';
import { last } from 'ramda';
import { useState } from 'react';
import { DeltaChip } from '../delta-chip';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Badge } from '../ui/badge';

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
    availableMetrics.findIndex(([key]) => key === payload?.primaryMetric),
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
    if (value == null) return '-';
    if (metricUnit === 'ratio') return `${(value * 100).toFixed(1)}%`;
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
        <span className="capitalize flex items-center gap-2">
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

  return (
    <div
      className={cn(
        'card p-4 h-full flex flex-col hover:bg-def-50 transition-colors group/card',
        className,
      )}
    >
      <div
        className={cn(
          'row justify-between h-4 items-center',
          onFilter && 'group-hover/card:hidden',
        )}
      >
        <Badge variant="outline" className="-ml-2">
          {formatWindowKind(insight.windowKind)}
        </Badge>
        {/* Severity: subtle dot instead of big pill */}
        {insight.severityBand && (
          <div className="flex items-center gap-1 shrink-0">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                insight.severityBand === 'severe'
                  ? 'bg-red-500'
                  : insight.severityBand === 'moderate'
                    ? 'bg-yellow-500'
                    : 'bg-blue-500',
              )}
            />
            <span className="text-[11px] text-muted-foreground capitalize">
              {insight.severityBand}
            </span>
          </div>
        )}
      </div>
      {onFilter && (
        <div className="row group-hover/card:flex hidden h-4 justify-between gap-2">
          {availableMetrics.length > 1 ? (
            <button
              type="button"
              className="text-[11px] text-muted-foreground capitalize flex items-center gap-1"
              onClick={() =>
                setMetricIndex((metricIndex + 1) % availableMetrics.length)
              }
            >
              <RotateCcwIcon className="size-2" />
              Show{' '}
              {metricKeyToLabel(
                availableMetrics[
                  (metricIndex + 1) % availableMetrics.length
                ][0],
              )}
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            className="text-[11px] text-muted-foreground capitalize flex items-center gap-1"
            onClick={onFilter}
          >
            Filter <FilterIcon className="size-2" />
          </button>
        </div>
      )}
      <div className="font-semibold text-sm leading-snug line-clamp-2 mt-2">
        {renderTitle()}
      </div>

      {/* Metric row */}
      <div className="mt-auto pt-2">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground mb-1">
              {metricLabel}
            </div>

            <div className="col gap-1">
              <div className="text-2xl font-semibold tracking-tight">
                {formatValue(currentValue)}
              </div>

              {/* Inline compare, smaller */}
              {compareValue != null && (
                <div className="text-xs text-muted-foreground">
                  vs {formatValue(compareValue)}
                </div>
              )}
            </div>
          </div>

          {/* Delta chip */}
          <DeltaChip
            variant={isIncrease ? 'inc' : isDecrease ? 'dec' : 'default'}
            size="sm"
          >
            {deltaText}
          </DeltaChip>
        </div>
      </div>
    </div>
  );
}
