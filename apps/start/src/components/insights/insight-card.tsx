import { countries } from '@/translations/countries';
import { cn } from '@/utils/cn';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Badge } from '../ui/badge';

type InsightPayload = {
  metric?: 'sessions' | 'pageviews' | 'share';
  primaryDimension?: {
    type: string;
    displayName: string;
  };
  extra?: {
    currentShare?: number;
    compareShare?: number;
    shareShiftPp?: number;
    isNew?: boolean;
    isGone?: boolean;
  };
};

type Insight = {
  id: string;
  title: string;
  summary: string | null;
  payload: unknown;
  currentValue: number | null;
  compareValue: number | null;
  changePct: number | null;
  direction: string | null;
  moduleKey: string;
  dimensionKey: string;
  windowKind: string;
  severityBand: string | null;
  impactScore?: number | null;
  firstDetectedAt?: string | Date;
};

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
  insight: Insight;
  className?: string;
}

export function InsightCard({ insight, className }: InsightCardProps) {
  const payload = insight.payload as InsightPayload | null;
  const dimension = payload?.primaryDimension;
  const metric = payload?.metric ?? 'sessions';
  const extra = payload?.extra;

  // Determine if this is a share-based insight (geo, devices)
  const isShareBased = metric === 'share';

  // Get the values to display based on metric type
  const currentValue = isShareBased
    ? (extra?.currentShare ?? null)
    : (insight.currentValue ?? null);
  const compareValue = isShareBased
    ? (extra?.compareShare ?? null)
    : (insight.compareValue ?? null);

  // Get direction and change
  const direction = insight.direction ?? 'flat';
  const isIncrease = direction === 'up';
  const isDecrease = direction === 'down';

  // Format the delta display
  const deltaText = isShareBased
    ? `${Math.abs(extra?.shareShiftPp ?? 0).toFixed(1)}pp`
    : `${Math.abs((insight.changePct ?? 0) * 100).toFixed(1)}%`;

  // Format metric values
  const formatValue = (value: number | null): string => {
    if (value == null) return '-';
    if (isShareBased) return `${(value * 100).toFixed(1)}%`;
    return Math.round(value).toLocaleString();
  };

  // Get the metric label
  const metricLabel = isShareBased
    ? 'Share'
    : metric === 'pageviews'
      ? 'Pageviews'
      : 'Sessions';

  const renderTitle = () => {
    const t = insight.title.replace(/↑.*$/, '').replace(/↓.*$/, '').trim();
    if (
      dimension &&
      (dimension.type === 'country' ||
        dimension.type === 'referrer' ||
        dimension.type === 'device')
    ) {
      return (
        <span className="capitalize flex items-center gap-2">
          <SerieIcon name={dimension.displayName} />{' '}
          {countries[dimension.displayName as keyof typeof countries] || t}
        </span>
      );
    }

    return t;
  };

  return (
    <div
      className={cn(
        'card p-4 h-full flex flex-col hover:bg-def-50 transition-colors',
        className,
      )}
    >
      <div className="row justify-between">
        <Badge variant="outline" className="-ml-2">
          {formatWindowKind(insight.windowKind)}
          <span className="text-muted-foreground mx-1">/</span>
          <span className="capitalize">{dimension?.type ?? 'unknown'}</span>
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

            <div className="flex items-baseline gap-2">
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
            isIncrease={isIncrease}
            isDecrease={isDecrease}
            deltaText={deltaText}
          />
        </div>
      </div>
    </div>
  );
}

function DeltaChip({
  isIncrease,
  isDecrease,
  deltaText,
}: {
  isIncrease: boolean;
  isDecrease: boolean;
  deltaText: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold',
        isIncrease
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : isDecrease
            ? 'bg-red-500/10 text-red-600 dark:text-red-400'
            : 'bg-muted text-muted-foreground',
      )}
    >
      {isIncrease ? (
        <ArrowUp size={16} className="shrink-0" />
      ) : isDecrease ? (
        <ArrowDown size={16} className="shrink-0" />
      ) : null}
      <span>{deltaText}</span>
    </div>
  );
}
