import type { RouterOutputs } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';
import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ChartTooltipHeader,
  ChartTooltipItem,
  createChartTooltip,
} from '@/components/charts/chart-tooltip';
import { Combobox } from '@/components/ui/combobox';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { fancyMinutes } from '@/hooks/use-numer-formatter';
import type { IInterval } from '@openpanel/validation';
import { useXAxisProps, useYAxisProps } from '../common/axis';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';

type TtcAggregation =
  | 'avg'
  | 'median'
  | 'min'
  | 'max'
  | 'p25'
  | 'p75'
  | 'p90'
  | 'p99';

const TTC_AGGREGATION_ITEMS = [
  { label: 'Average', value: 'avg' as const },
  { label: 'Median', value: 'median' as const },
  { label: 'Min', value: 'min' as const },
  { label: 'Max', value: 'max' as const },
  { label: 'P25', value: 'p25' as const },
  { label: 'P75', value: 'p75' as const },
  { label: 'P90', value: 'p90' as const },
  { label: 'P99', value: 'p99' as const },
];

type TtcItem = {
  date: string;
  completedCount: number;
  ttc: Record<string, number>;
};

type FunnelSerieWithTtc = RouterOutputs['chart']['funnel']['current'][number] & {
  timeToConvert?: TtcItem[];
};

type FunnelData = Omit<RouterOutputs['chart']['funnel'], 'current'> & {
  current: FunnelSerieWithTtc[];
};

interface Props {
  data: FunnelData;
}

export function FunnelTtcChart({ data }: Props) {
  const {
    report: { interval, lineType },
  } = useReportChartContext();
  const [ttcAggregation, setTtcAggregation] = useState<TtcAggregation>('avg');

  const series = data.current;

  const rechartData = useMemo(() => {
    // Collect all unique dates from all series' timeToConvert
    const dateSet = new Set<string>();
    series.forEach((serie) => {
      serie.timeToConvert?.forEach((item) => {
        dateSet.add(item.date);
      });
    });

    const dates = Array.from(dateSet).sort();

    return dates.map((date) => {
      const point: Record<string, any> = {
        date,
        timestamp: new Date(date).getTime(),
      };

      series.forEach((serie, index) => {
        const ttcItem = serie.timeToConvert?.find(
          (item) => item.date === date,
        );
        if (ttcItem) {
          point[`serie:${index}:ttcValue`] =
            ttcItem.ttc?.[ttcAggregation] ?? null;
          point[`serie:${index}:ttc`] = ttcItem.ttc;
        }
      });

      return point;
    });
  }, [series, ttcAggregation]);

  const xAxisProps = useXAxisProps({ interval: interval ?? 'day' });
  const yAxisProps = useYAxisProps({
    tickFormatter: (value: number) => fancyMinutes(value),
  });

  const hasBreakdowns = series.length > 1;

  return (
    <TtcTooltipProvider
      series={series}
      interval={interval ?? 'day'}
      ttcAggregation={ttcAggregation}
    >
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-sm text-muted-foreground">Aggregation:</span>
        <Combobox
          placeholder="Select aggregation"
          value={ttcAggregation}
          onChange={(val) => setTtcAggregation(val as TtcAggregation)}
          items={TTC_AGGREGATION_ITEMS}
        />
      </div>
      <div className="aspect-video max-h-[300px] w-full p-4 card pb-1">
        <ResponsiveContainer>
          <LineChart data={rechartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={true}
              vertical={false}
              className="stroke-border"
            />
            <YAxis {...yAxisProps} />
            <XAxis {...xAxisProps} allowDuplicatedCategory={false} />
            {hasBreakdowns && (
              <Legend
                content={() => (
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs mt-4 -mb-2">
                    {series.map((serie, index) => (
                      <div
                        className="flex items-center gap-1"
                        key={serie.id}
                        style={{ color: getChartColor(index) }}
                      >
                        <SerieIcon name={serie.breakdowns ?? []} />
                        <SerieName
                          name={
                            serie.breakdowns?.length
                              ? serie.breakdowns
                              : ['Funnel']
                          }
                          className="font-semibold"
                        />
                      </div>
                    ))}
                  </div>
                )}
              />
            )}
            <TtcTooltip />
            {series.map((serie, index) => {
              const color = getChartColor(index);
              return (
                <Line
                  key={`serie:${index}:ttcValue`}
                  dataKey={`serie:${index}:ttcValue`}
                  stroke={color}
                  type={lineType ?? 'monotone'}
                  isAnimationActive={false}
                  strokeWidth={2}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </TtcTooltipProvider>
  );
}

const { Tooltip: TtcTooltip, TooltipProvider: TtcTooltipProvider } =
  createChartTooltip<
    Record<string, any>,
    {
      series: FunnelSerieWithTtc[];
      interval: IInterval;
      ttcAggregation: TtcAggregation;
    }
  >(({ data, context }) => {
    if (!data || !data[0]) {
      return null;
    }

    const payload = data[0];
    const { date } = payload;
    const formatDate = useFormatDateInterval({
      interval: context.interval,
      short: false,
    });

    return (
      <>
        {context.series.map((serie, index) => {
          const ttc = payload[`serie:${index}:ttc`] as
            | Record<string, number>
            | undefined;
          if (!ttc) return null;
          const value = ttc[context.ttcAggregation];

          return (
            <React.Fragment key={serie.id}>
              {index === 0 && (
                <ChartTooltipHeader>
                  <div>{formatDate(date)}</div>
                </ChartTooltipHeader>
              )}
              <ChartTooltipItem color={getChartColor(index)}>
                <div className="flex items-center gap-1">
                  <SerieIcon name={serie.breakdowns ?? []} />
                  <SerieName
                    name={
                      serie.breakdowns?.length ? serie.breakdowns : ['Funnel']
                    }
                  />
                </div>
                <div className="font-mono font-medium">
                  {value != null ? fancyMinutes(value) : 'N/A'}
                </div>
              </ChartTooltipItem>
            </React.Fragment>
          );
        })}
      </>
    );
  });
