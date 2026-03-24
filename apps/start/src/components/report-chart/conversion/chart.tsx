import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import React, { useCallback, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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
import { useConversionRechartDataModel } from '@/hooks/use-conversion-rechart-data-model';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { fancyMinutes, useNumber } from '@/hooks/use-numer-formatter';
import { useVisibleConversionSeries } from '@/hooks/use-visible-conversion-series';
import { useTRPC } from '@/integrations/trpc/react';
import { average, getPreviousMetric, round } from '@openpanel/common';
import type { IInterval } from '@openpanel/validation';
import { useQuery } from '@tanstack/react-query';
import { useXAxisProps, useYAxisProps } from '../common/axis';
import { PreviousDiffIndicator } from '../common/previous-diff-indicator';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';
import { ConversionTable } from './conversion-table';

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

interface Props {
  data: RouterOutputs['chart']['conversion'];
}

export function Chart({ data }: Props) {
  const {
    report: {
      interval,
      projectId,
      startDate,
      endDate,
      range,
      lineType,
      measuring,
    },
    isEditMode,
    options: { hideXAxis, hideYAxis, maxDomain },
  } = useReportChartContext();
  const isTtc = measuring === 'time_to_convert';
  const [ttcAggregation, setTtcAggregation] = useState<TtcAggregation>('avg');
  const { series, setVisibleSeries } = useVisibleConversionSeries(data, 5);
  const rechartData = useConversionRechartDataModel(series);
  const trpc = useTRPC();
  const references = useQuery(
    trpc.reference.getChartReferences.queryOptions(
      {
        projectId,
        startDate,
        endDate,
        range,
      },
      {},
    ),
  );

  // For TTC mode, transform rechart data to include the selected aggregation value
  const ttcRechartData = useMemo(() => {
    if (!isTtc) return rechartData;
    return rechartData.map((point) => {
      const newPoint = { ...point };
      series.forEach((serie) => {
        const ttc = point[`${serie.id}:ttc`] as
          | Record<string, number>
          | undefined;
        if (ttc) {
          newPoint[`${serie.id}:ttcValue`] = ttc[ttcAggregation] ?? null;
        }
      });
      return newPoint;
    });
  }, [rechartData, isTtc, ttcAggregation, series]);

  const xAxisProps = useXAxisProps({ interval, hide: hideXAxis });
  const yAxisProps = useYAxisProps({
    hide: hideYAxis,
  });

  // Compute a tight Y-axis domain so small differences between data points
  // are visible instead of being flattened against a 0-100 baseline.
  const yDomain = useMemo<[number, number]>(() => {
    const allRates = series
      .flatMap((serie) => serie.data.map((d) => d.rate))
      .filter((r) => r != null && !Number.isNaN(r));
    if (allRates.length === 0) return [0, 100];
    const min = Math.min(...allRates);
    const max = Math.max(...allRates);
    const padding = Math.max((max - min) * 0.2, 2);
    return [
      Math.max(0, Math.floor(min - padding)),
      Math.min(100, Math.ceil(max + padding)),
    ];
  }, [series]);

  const averageConversionRate = average(
    series.map((serie) => {
      return average(serie.data.map((item) => item.rate));
    }, 0),
  );

  const handleChartClick = useCallback((e: any) => {
    if (e?.activePayload?.[0]) {
      const clickedData = e.activePayload[0].payload;
      if (clickedData.date) {
        pushModal('AddReference', {
          datetime: new Date(clickedData.date).toISOString(),
        });
      }
    }
  }, []);

  const CustomLegend = useCallback(() => {
    return (
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs mt-4 -mb-2">
        {series.map((serie) => (
          <div
            className="flex items-center gap-1"
            key={serie.id}
            style={{
              color: getChartColor(serie.index),
            }}
          >
            <SerieIcon name={serie.breakdowns} />
            <SerieName
              name={
                serie.breakdowns.length > 0 ? serie.breakdowns : ['Conversion']
              }
              className="font-semibold"
            />
          </div>
        ))}
      </div>
    );
  }, [series]);

  const chartData = isTtc ? ttcRechartData : rechartData;

  return (
    <TooltipProvider
      conversion={data}
      interval={interval}
      visibleSeries={series}
      isTtc={isTtc}
      ttcAggregation={ttcAggregation}
    >
      {isTtc && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-sm text-muted-foreground">Aggregation:</span>
          <Combobox
            placeholder="Select aggregation"
            value={ttcAggregation}
            onChange={(val) => setTtcAggregation(val as TtcAggregation)}
            items={TTC_AGGREGATION_ITEMS}
          />
        </div>
      )}
      <div className={cn('h-full w-full', isEditMode && 'card p-4')}>
        <ResponsiveContainer>
          <LineChart data={chartData} onClick={handleChartClick}>
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
                stroke={'oklch(from var(--foreground) l c h / 0.1)'}
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
            {isTtc ? (
              <YAxis
                {...yAxisProps}
                tickFormatter={(value: number) => fancyMinutes(value)}
              />
            ) : (
              <YAxis {...yAxisProps} domain={yDomain} />
            )}
            <XAxis {...xAxisProps} allowDuplicatedCategory={false} />
            {series.length > 1 && <Legend content={<CustomLegend />} />}
            <Tooltip />
            {!isTtc &&
              series.map((serie) => {
                const color = getChartColor(serie.index);
                return (
                  <Line
                    key={`${serie.id}:previousRate`}
                    dot={false}
                    dataKey={`${serie.id}:previousRate`}
                    stroke={color}
                    type={lineType}
                    isAnimationActive={false}
                    strokeWidth={1}
                    strokeOpacity={0.3}
                  />
                );
              })}
            {series.map((serie) => {
              const color = getChartColor(serie.index);
              const dataKey = isTtc
                ? `${serie.id}:ttcValue`
                : `${serie.id}:rate`;
              return (
                <Line
                  key={dataKey}
                  dataKey={dataKey}
                  stroke={color}
                  type={lineType}
                  isAnimationActive={false}
                  strokeWidth={2}
                  connectNulls
                />
              );
            })}
            {!isTtc &&
              typeof averageConversionRate === 'number' &&
              averageConversionRate && (
                <ReferenceLine
                  y={averageConversionRate}
                  stroke={getChartColor(series.length)}
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                  strokeLinecap="round"
                  label={{
                    value: `Average (${round(averageConversionRate, 2)} %)`,
                    fill: getChartColor(series.length),
                    position: 'insideBottomRight',
                    fontSize: 12,
                  }}
                />
              )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ConversionTable
        data={data}
        visibleSeries={series}
        setVisibleSeries={setVisibleSeries}
      />
    </TooltipProvider>
  );
}

const { Tooltip, TooltipProvider } = createChartTooltip<
  Record<string, any>,
  {
    conversion: RouterOutputs['chart']['conversion'];
    interval: IInterval;
    visibleSeries: RouterOutputs['chart']['conversion']['current'];
    isTtc: boolean;
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
  const number = useNumber();

  return (
    <>
      {context.visibleSeries.map((serie, index) => {
        if (context.isTtc) {
          const ttc = payload[`${serie.id}:ttc`] as
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
                  <SerieIcon
                    name={
                      serie.breakdowns.length > 0
                        ? serie.breakdowns
                        : ['Conversion']
                    }
                  />
                  <SerieName
                    name={
                      serie.breakdowns.length > 0
                        ? serie.breakdowns
                        : ['Conversion']
                    }
                  />
                </div>
                <div className="font-mono font-medium">
                  {value != null ? fancyMinutes(value) : 'N/A'}
                </div>
              </ChartTooltipItem>
            </React.Fragment>
          );
        }

        const rate = payload[`${serie.id}:rate`];
        const total = payload[`${serie.id}:total`];
        const previousRate = payload[`${serie.id}:previousRate`];

        if (rate === undefined) {
          return null;
        }

        const prevSerie = context.conversion?.previous?.find(
          (p) => p.id === serie.id,
        );
        const prevItem = prevSerie?.data.find((d) => d.date === date);
        const previousMetric = getPreviousMetric(rate, previousRate);

        return (
          <React.Fragment key={serie.id}>
            {index === 0 && (
              <ChartTooltipHeader>
                <div>{formatDate(date)}</div>
              </ChartTooltipHeader>
            )}
            <ChartTooltipItem color={getChartColor(index)}>
              <div className="flex items-center gap-1">
                <SerieIcon
                  name={
                    serie.breakdowns.length > 0
                      ? serie.breakdowns
                      : ['Conversion']
                  }
                />
                <SerieName
                  name={
                    serie.breakdowns.length > 0
                      ? serie.breakdowns
                      : ['Conversion']
                  }
                />
              </div>
              <div className="flex justify-between gap-8 font-mono font-medium">
                <div className="row gap-1">
                  <span>{number.formatWithUnit(rate / 100, '%')}</span>
                  <span className="text-muted-foreground">({total})</span>
                  {prevItem && previousRate !== undefined && (
                    <span className="text-muted-foreground">
                      ({number.formatWithUnit(previousRate / 100, '%')})
                    </span>
                  )}
                </div>
                {previousRate !== undefined && (
                  <PreviousDiffIndicator {...previousMetric} />
                )}
              </div>
            </ChartTooltipItem>
          </React.Fragment>
        );
      })}
    </>
  );
});
