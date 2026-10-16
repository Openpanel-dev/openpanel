import type { IChartMetric } from '@openpanel/core/modules/report/report.constants';
import { curveStepAfter } from 'd3-shape';
import {
  getDiffIndicator,
  PreviousDiffIndicator,
} from '../common/previous-diff-indicator';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';
import { Area, AreaChart } from '@/components/charts/area-chart';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { fancyMinutes, useNumber } from '@/hooks/use-numer-formatter';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';

const SPARKLINE_MARGIN = { top: 0, right: 0, bottom: 0, left: 0 };
const SPARKLINE_FILL_OPACITY = 0.2;

interface MetricCardProps {
  serie: IChartData['series'][number];
  color?: string;
  metric: IChartMetric;
  unit?: string;
}

export function MetricCard({
  serie,
  color: _color,
  metric,
  unit,
}: MetricCardProps) {
  const {
    isEditMode,
    report: { interval },
  } = useReportChartContext();
  const number = useNumber();

  const renderValue = (value: number | undefined, unitClassName?: string) => {
    // A genuine 0 is a real value, not a missing one — `min` is 0 whenever the
    // range contains an empty bucket. Only absent metrics render as N/A, which
    // still matters: getAggregateChartSql never selects total_count, so `count`
    // really is undefined for bar/pie series.
    if (value === undefined || value === null) {
      return <div className="text-muted-foreground">N/A</div>;
    }

    if (unit === 'min') {
      return <>{fancyMinutes(value)}</>;
    }

    return (
      <>
        {number.short(value)}
        {unit && <span className={unitClassName}>{unit}</span>}
      </>
    );
  };

  const previous = serie.metrics.previous?.[metric];

  const graphColors = getDiffIndicator(
    false,
    previous?.state,
    '#6ee7b7', // green
    '#fda4af', // red
    '#93c5fd' // blue
  );

  return (
    <div
      className={cn(
        'group relative h-full p-4 hover:z-10',
        isEditMode && 'card h-auto'
      )}
      key={serie.id}
    >
      <div
        className={cn(
          'absolute top-0 -right-1 bottom-0 -left-1 z-0 opacity-100 transition-opacity duration-300 group-hover:opacity-100'
        )}
      >
        <div className="absolute inset-x-0 bottom-0 h-1/4">
          <AreaChart
            animationDuration={0}
            aspectRatio="auto"
            className="h-full"
            data={serie.data}
            margin={SPARKLINE_MARGIN}
            xDataKey="date"
          >
            <Area
              animate={false}
              curve={curveStepAfter}
              dataKey="count"
              fill={graphColors}
              fillOpacity={SPARKLINE_FILL_OPACITY}
              stroke={graphColors}
              strokeWidth={1}
            />
            <OPChartTooltip<(typeof serie.data)[number]>
              interval={interval}
              rows={(point) => [
                { color: graphColors, label: 'Count', value: point.count },
              ]}
            />
          </AreaChart>
        </div>
      </div>
      <MetricCardNumber
        enhancer={
          <PreviousDiffIndicator
            {...previous}
            className="text-muted-foreground text-sm"
          />
        }
        label={<SerieName name={serie.names} />}
        value={renderValue(serie.metrics[metric], 'ml-1 font-light text-xl')}
      />
    </div>
  );
}

export function MetricCardNumber({
  label,
  value,
  enhancer,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  enhancer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-left">
          <span className="truncate text-muted-foreground">{label}</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div className="truncate font-bold font-mono text-3xl">{value}</div>
        {enhancer}
      </div>
    </div>
  );
}
