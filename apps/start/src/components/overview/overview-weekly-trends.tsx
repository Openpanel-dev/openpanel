import {
  ChartTooltipContainer,
  ChartTooltipHeader,
  ChartTooltipItem,
} from '@/components/charts/chart-tooltip';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { Widget, WidgetBody } from '../widget';
import { WidgetHeadSearchable } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';

interface OverviewWeeklyTrendsProps {
  projectId: string;
  shareId?: string;
}

type MetricKey =
  | 'unique_visitors'
  | 'total_sessions'
  | 'total_screen_views'
  | 'bounce_rate'
  | 'views_per_session'
  | 'avg_session_duration';

const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: 'unique_visitors', label: 'Unique Visitors', unit: '' },
  { key: 'total_sessions', label: 'Sessions', unit: '' },
  { key: 'total_screen_views', label: 'Pageviews', unit: '' },
  { key: 'bounce_rate', label: 'Bounce Rate', unit: 'pct' },
  { key: 'views_per_session', label: 'Pages / Session', unit: '' },
  { key: 'avg_session_duration', label: 'Session Duration', unit: 'min' },
];

const SHORT_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONG_DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function formatHourRange(hour: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hour)}:00 – ${pad(hour)}:59`;
}

function getColorClass(ratio: number) {
  if(ratio === 0) return 'bg-transparent';
  if (ratio < 0.1) return 'bg-chart-0/5';
  if (ratio < 0.2) return 'bg-chart-0/10';
  if (ratio < 0.3) return 'bg-chart-0/20';
  if (ratio < 0.4) return 'bg-chart-0/30';
  if (ratio < 0.5) return 'bg-chart-0/40';
  if (ratio < 0.6) return 'bg-chart-0/50';
  if (ratio < 0.7) return 'bg-chart-0/60';
  if (ratio < 0.8) return 'bg-chart-0/70';
  if (ratio < 0.9) return 'bg-chart-0/90';
  return 'bg-chart-0';
}

export default function OverviewWeeklyTrends({
  projectId,
  shareId,
}: OverviewWeeklyTrendsProps) {
  const { range, startDate, endDate } = useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const [metric, setMetric] = useState<MetricKey>('unique_visitors');
  const trpc = useTRPC();
  const number = useNumber();

  const query = useQuery(
    trpc.overview.stats.queryOptions({
      projectId,
      shareId,
      range,
      interval: 'hour',
      filters,
      startDate,
      endDate,
    }),
  );

  // Build a 7×24 heatmap: aggregated[dayOfWeek][hour] averaged over all weeks
  const heatmap = useMemo(() => {
    const series = query.data?.series;
    if (!series?.length) return null;

    // aggregated[day 0=Mon..6=Sun][hour]
    const sums: number[][] = Array.from({ length: 7 }, () =>
      Array(24).fill(0),
    );
    const counts: number[][] = Array.from({ length: 7 }, () =>
      Array(24).fill(0),
    );

    for (const item of series) {
      const value = item[metric];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;

      const d = new Date(item.date);
      // JS getDay(): 0=Sun,1=Mon,...,6=Sat → remap to 0=Mon..6=Sun
      const jsDay = d.getDay();
      const day = jsDay === 0 ? 6 : jsDay - 1;
      const hour = d.getHours();

      sums[day]![hour]! += value;
      counts[day]![hour]! += 1;
    }

    const averages: number[][] = sums.map((row, day) =>
      row.map((sum, hour) => {
        const count = counts[day]![hour]!;
        return count > 0 ? sum / count : 0;
      }),
    );

    let max = 0;
    for (const row of averages) {
      for (const v of row) {
        if (v > max) max = v;
      }
    }

    return { averages, max };
  }, [query.data, metric]);

  const activeMetric = METRICS.find((m) => m.key === metric)!;

  return (
    <Widget className="col-span-6">
      <WidgetHeadSearchable
        tabs={METRICS.map((m) => ({ key: m.key, label: m.label }))}
        activeTab={metric}
        onTabChange={setMetric}
      />
      <WidgetBody>
        {query.isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : !heatmap ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No data available
          </div>
        ) : (
          <div className="flex">
            {/* Hour labels */}
            <div className="w-14 shrink-0 pr-2">
              {/* Spacer for the day-label row */}
              <div className="h-6" />
              {Array.from({ length: 24 }, (_, hour) => (
                <div
                  key={hour}
                  className="flex h-4 items-center justify-end text-[10px] text-muted-foreground"
                >
                  {hour % 3 === 0
                    ? `${String(hour).padStart(2, '0')}:00`
                    : ''}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex-1 min-w-0">
              {/* Day labels */}
              <div className="flex h-6">
                {SHORT_DAY_NAMES.map((day) => (
                  <div
                    key={day}
                    className="flex-1 text-center text-[11px] text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
              </div>

          <TooltipProvider disableHoverableContent delayDuration={0}>
              {/* Rows = hours, columns = days */}
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="flex h-4">
                  {Array.from({ length: 7 }, (_, day) => {
                    const value = heatmap.averages[day]![hour]!;
                    const ratio =
                      heatmap.max > 0 && value > 0
                        ? value / heatmap.max
                        : 0;
                    const colorClass = getColorClass(ratio)

                    return (
                      <Tooltip key={day}>
                        <TooltipTrigger asChild>
                          <div className={cn(
                            'flex-1 p-0.5 group',
                          )}>
                          <div  className={cn(
                            'size-full rounded-sm transition-all group-hover:ring-1 group-hover:ring-emerald-400',
                            colorClass,
                          )}

                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="border-0 bg-transparent p-0 shadow-none"

                        >
                          <ChartTooltipContainer>
                            <ChartTooltipHeader>
                              <div className="text-sm font-medium">
                                {LONG_DAY_NAMES[day]}, {formatHourRange(hour)}
                              </div>
                            </ChartTooltipHeader>
                            <ChartTooltipItem color="#10b981">
                              <div className="flex items-center justify-between gap-6 font-mono font-medium text-sm">
                                <div className="text-muted-foreground">
                                  {activeMetric.label}
                                </div>
                                <div>
                                  {activeMetric.unit === 'pct'
                                    ? `${number.format(value)} %`
                                    : number.formatWithUnit(
                                        value,
                                        activeMetric.unit || null,
                                      )}
                                </div>
                              </div>
                            </ChartTooltipItem>
                          </ChartTooltipContainer>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
          </TooltipProvider>
            </div>
          </div>
        )}
      </WidgetBody>
    </Widget>
  );
}
