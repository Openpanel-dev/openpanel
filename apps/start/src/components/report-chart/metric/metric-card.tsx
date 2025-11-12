import { fancyMinutes, useNumber } from '@/hooks/use-numer-formatter';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Area, AreaChart, Tooltip } from 'recharts';

import type { IChartMetric } from '@openpanel/validation';

import {
  ChartTooltipContainer,
  ChartTooltipHeader,
  ChartTooltipItem,
} from '@/components/charts/chart-tooltip';
import { formatDate } from '@/utils/date';
import { getChartColor } from '@/utils/theme';
import {
  PreviousDiffIndicator,
  getDiffIndicator,
} from '../common/previous-diff-indicator';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';

interface MetricCardProps {
  serie: IChartData['series'][number];
  color?: string;
  metric: IChartMetric;
  unit?: string;
}

const TooltipContent = (props: { payload?: any[] }) => {
  const number = useNumber();
  return (
    <ChartTooltipContainer>
      {props.payload?.map((item) => {
        const { date, count } = item.payload;
        return (
          <div key={item.id} className="col gap-2">
            <ChartTooltipHeader>
              <div>{formatDate(new Date(date))}</div>
            </ChartTooltipHeader>
            <ChartTooltipItem color={getChartColor(0)}>
              <div>{number.format(count)}</div>
            </ChartTooltipItem>
          </div>
        );
      })}
    </ChartTooltipContainer>
  );
};

export function MetricCard({
  serie,
  color: _color,
  metric,
  unit,
}: MetricCardProps) {
  const {
    report: { previousIndicatorInverted },
    isEditMode,
  } = useReportChartContext();
  const number = useNumber();

  const renderValue = (value: number | undefined, unitClassName?: string) => {
    if (!value) {
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
    previousIndicatorInverted,
    previous?.state,
    '#6ee7b7', // green
    '#fda4af', // red
    '#93c5fd', // blue
  );

  return (
    <div
      className={cn('group relative p-4', isEditMode && 'card h-auto')}
      key={serie.id}
    >
      <div
        className={cn(
          'absolute -left-1 -right-1 bottom-0 top-0 z-0 opacity-100 transition-opacity duration-300 group-hover:opacity-100',
        )}
      >
        <AutoSizer>
          {({ width, height }) => (
            <AreaChart
              width={width}
              height={height / 4}
              data={serie.data}
              style={{ marginTop: (height / 4) * 3 }}
            >
              <defs>
                <linearGradient
                  id={`colorUv${serie.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={graphColors} stopOpacity={0.2} />
                  <stop
                    offset="100%"
                    stopColor={graphColors}
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <Tooltip content={TooltipContent} />
              <Area
                dataKey="count"
                type="step"
                fill={`url(#colorUv${serie.id})`}
                fillOpacity={1}
                stroke={graphColors}
                strokeWidth={1}
                isAnimationActive={false}
              />
            </AreaChart>
          )}
        </AutoSizer>
      </div>
      <MetricCardNumber
        label={<SerieName name={serie.names} />}
        value={renderValue(serie.metrics[metric], 'ml-1 font-light text-xl')}
        enhancer={
          <PreviousDiffIndicator
            {...previous}
            className="text-sm text-muted-foreground"
          />
        }
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
        <div className="truncate font-mono text-3xl font-bold">{value}</div>
        {enhancer}
      </div>
    </div>
  );
}
