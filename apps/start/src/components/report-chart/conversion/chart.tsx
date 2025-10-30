import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

import { createChartTooltip } from '@/components/charts/chart-tooltip';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { average, getPreviousMetric, round } from '@openpanel/common';
import type { IInterval } from '@openpanel/validation';
import { useQuery } from '@tanstack/react-query';
import { useXAxisProps, useYAxisProps } from '../common/axis';
import { PreviousDiffIndicatorPure } from '../common/previous-diff-indicator';
import { useReportChartContext } from '../context';

interface Props {
  data: RouterOutputs['chart']['conversion'];
}

export function Chart({ data }: Props) {
  const {
    report: {
      previous,
      interval,
      projectId,
      startDate,
      endDate,
      range,
      lineType,
      events,
    },
    isEditMode,
    options: { hideXAxis, hideYAxis, maxDomain },
  } = useReportChartContext();
  const dataLength = data.current.length || 0;
  const trpc = useTRPC();
  const references = useQuery(
    trpc.reference.getChartReferences.queryOptions(
      {
        projectId,
        startDate,
        endDate,
        range,
      },
      {
        staleTime: 1000 * 60 * 10,
      },
    ),
  );

  const xAxisProps = useXAxisProps({ interval, hide: hideXAxis });
  const yAxisProps = useYAxisProps({
    hide: hideYAxis,
  });

  const averageConversionRate = average(
    data.current.map((serie) => {
      return average(serie.data.map((item) => item.rate));
    }, 0),
  );

  const rechartData = data.current[0].data.map((item) => {
    return {
      ...item,
      timestamp: new Date(item.date).getTime(),
    };
  });

  return (
    <TooltipProvider conversion={data} interval={interval}>
      <div className={cn('h-full w-full', isEditMode && 'card p-4')}>
        <ResponsiveContainer>
          <LineChart data={rechartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={true}
              vertical={false}
              className="stroke-border"
            />
            {references.data?.map((ref) => (
              <ReferenceLine
                key={ref.id}
                x={ref.date.getTime()}
                stroke={'#94a3b8'}
                strokeDasharray={'3 3'}
                label={{
                  value: ref.title,
                  position: 'centerTop',
                  fill: '#334155',
                  fontSize: 12,
                }}
                fontSize={10}
              />
            ))}
            <YAxis {...yAxisProps} domain={[0, 100]} />
            <XAxis {...xAxisProps} allowDuplicatedCategory={false} />
            <Tooltip />
            <Line
              dot={false}
              dataKey="previousRate"
              stroke={getChartColor(0)}
              type={lineType}
              isAnimationActive={false}
              strokeWidth={1}
              strokeOpacity={0.5}
            />
            <Line
              dot={false}
              dataKey="rate"
              stroke={getChartColor(0)}
              type={lineType}
              isAnimationActive={false}
              strokeWidth={2}
            />
            {typeof averageConversionRate === 'number' &&
              averageConversionRate && (
                <ReferenceLine
                  y={averageConversionRate}
                  stroke={getChartColor(1)}
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                  strokeLinecap="round"
                  label={{
                    value: `Average (${round(averageConversionRate, 2)} %)`,
                    fill: getChartColor(1),
                    position: 'insideBottomRight',
                    fontSize: 12,
                  }}
                />
              )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </TooltipProvider>
  );
}

const { Tooltip, TooltipProvider } = createChartTooltip<
  NonNullable<
    RouterOutputs['chart']['conversion']['current'][number]
  >['data'][number],
  {
    conversion: RouterOutputs['chart']['conversion'];
    interval: IInterval;
  }
>(({ data, context }) => {
  if (!data[0]) {
    return null;
  }

  const { date } = data[0];
  const formatDate = useFormatDateInterval(context.interval);
  const number = useNumber();
  return (
    <>
      <div className="flex justify-between gap-8 text-muted-foreground">
        <div>{formatDate(date)}</div>
      </div>
      {context.conversion.current.map((serie, index) => {
        const item = data[index];
        if (!item) {
          return null;
        }
        const prevItem = context.conversion?.previous?.[0]?.data[item.index];

        const title =
          serie.breakdowns.length > 0
            ? (serie.breakdowns.join(',') ?? 'Not set')
            : 'Conversion';
        return (
          <div className="row gap-2" key={serie.id}>
            <div
              className="w-[3px] rounded-full"
              style={{ background: getChartColor(index) }}
            />
            <div className="col flex-1 gap-1">
              <div className="flex items-center gap-1">{title}</div>
              <div className="flex justify-between gap-8 font-mono font-medium">
                <div className="col gap-1">
                  <span>{number.formatWithUnit(item.rate / 100, '%')}</span>
                  <span>{item.total}</span>
                </div>

                {!!prevItem && (
                  <div className="col gap-1">
                    <PreviousDiffIndicatorPure
                      {...getPreviousMetric(item.rate, prevItem?.rate)}
                    />
                    <span className="text-muted-foreground">
                      ({prevItem?.total})
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
});
