import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import React, { useCallback } from 'react';
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
import { useConversionRechartDataModel } from '@/hooks/use-conversion-rechart-data-model';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
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

interface Props {
  data: RouterOutputs['chart']['conversion'];
}

export function Chart({ data }: Props) {
  const {
    report: { interval, projectId, startDate, endDate, range, lineType },
    isEditMode,
    options: { hideXAxis, hideYAxis, maxDomain },
  } = useReportChartContext();
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

  return (
    <TooltipProvider
      conversion={data}
      interval={interval}
      visibleSeries={series}
    >
      <div className={cn('h-full w-full', isEditMode && 'card p-4')}>
        <ResponsiveContainer>
          <LineChart data={rechartData} onClick={handleChartClick}>
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
            <YAxis {...yAxisProps} domain={[0, 100]} />
            <XAxis {...xAxisProps} allowDuplicatedCategory={false} />
            {series.length > 1 && <Legend content={<CustomLegend />} />}
            <Tooltip />
            {series.map((serie) => {
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
              return (
                <Line
                  key={`${serie.id}:rate`}
                  dataKey={`${serie.id}:rate`}
                  stroke={color}
                  type={lineType}
                  isAnimationActive={false}
                  strokeWidth={2}
                />
              );
            })}
            {typeof averageConversionRate === 'number' &&
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
