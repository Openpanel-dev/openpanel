import { FilterIcon, RotateCcwIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { DeltaChip } from '../delta-chip';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
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

  return (
    <div
      className={cn(
        'card group/card flex h-full flex-col p-4 transition-colors hover:bg-def-50',
        className
      )}
    >
      <div
        className={cn(
          'row h-4 items-center justify-between',
          onFilter && 'group-hover/card:hidden'
        )}
      >
        <Badge className="-ml-2" variant="outline">
          {formatWindowKind(insight.windowKind)}
        </Badge>
        {/* Severity: subtle dot instead of big pill */}
        {insight.severityBand && (
          <div className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                insight.severityBand === 'severe'
                  ? 'bg-red-500'
                  : insight.severityBand === 'moderate'
                    ? 'bg-yellow-500'
                    : 'bg-blue-500'
              )}
            />
            <span className="text-[11px] text-muted-foreground capitalize">
              {insight.severityBand}
            </span>
          </div>
        )}
      </div>
      {onFilter && (
        <div className="row hidden h-4 justify-between gap-2 group-hover/card:flex">
          {availableMetrics.length > 1 ? (
            <button
              className="flex items-center gap-1 text-[11px] text-muted-foreground capitalize"
              onClick={() =>
                setMetricIndex((metricIndex + 1) % availableMetrics.length)
              }
              type="button"
            >
              <RotateCcwIcon className="size-2" />
              Show{' '}
              {metricKeyToLabel(
                availableMetrics[(metricIndex + 1) % availableMetrics.length][0]
              )}
            </button>
          ) : (
            <div />
          )}
          <button
            className="flex items-center gap-1 text-[11px] text-muted-foreground capitalize"
            onClick={onFilter}
            type="button"
          >
            Filter <FilterIcon className="size-2" />
          </button>
        </div>
      )}
      <div className="mt-2 line-clamp-2 font-semibold text-sm leading-snug">
        {renderTitle()}
      </div>

      {/* AI plain-language summary (Tier-1 enrichment) */}
      {insight.aiSummary && (
        <p className="mt-1 line-clamp-3 text-muted-foreground text-xs leading-snug">
          {insight.aiSummary}
        </p>
      )}

      {/* Metric row */}
      <div className="mt-auto pt-2">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 text-[11px] text-muted-foreground">
              {metricLabel}
            </div>

            <div className="col gap-1">
              <div className="font-semibold text-2xl tracking-tight">
                {formatValue(currentValue)}
              </div>

              {/* Inline compare, smaller */}
              {compareValue != null && (
                <div className="text-muted-foreground text-xs">
                  vs {formatValue(compareValue)}
                </div>
              )}
            </div>
          </div>

          {/* Delta chip */}
          <DeltaChip
            size="sm"
            variant={isIncrease ? 'inc' : isDecrease ? 'dec' : 'default'}
          >
            {deltaText}
          </DeltaChip>
        </div>

        <Button
          className="mt-2 -ml-2 h-7 self-start px-2 text-muted-foreground text-xs"
          icon={SparklesIcon}
          onClick={() => pushModal('InsightDetails', { insight })}
          size="sm"
          variant="ghost"
        >
          Why did this happen?
        </Button>
      </div>
    </div>
  );
}
