import type { RouterOutputs } from '@/trpc/client';
import React, { useMemo } from 'react';

import { Stats, StatsCard } from '@/components/stats';
import { fancyMinutes, useNumber } from '@/hooks/use-numer-formatter';
import { formatDate } from '@/utils/date';
import { average, getPreviousMetric, sum } from '@openpanel/common';
import { ChevronRightIcon } from 'lucide-react';
import { PreviousDiffIndicatorPure } from '../common/previous-diff-indicator';
import { useReportChartContext } from '../context';

interface Props {
  data: RouterOutputs['chart']['conversion'];
}

export function Summary({ data }: Props) {
  const number = useNumber();
  const { report } = useReportChartContext();
  const isTtc = report.measuring === 'time_to_convert';

  if (isTtc) {
    return <TtcSummary data={data} />;
  }

  const bestConversionRateMatch = useMemo(() => {
    return data.current.reduce(
      (acc, serie, serieIndex) => {
        const serieMax = serie.data.reduce(
          (maxInSerie, item, dataIndex) => {
            if (item.rate > maxInSerie.rate) {
              return { rate: item.rate, serieIndex, dataIndex };
            }
            return maxInSerie;
          },
          { rate: 0, serieIndex, dataIndex: 0 },
        );

        return serieMax.rate > acc.rate ? serieMax : acc;
      },
      {
        rate: 0,
        serieIndex: 0,
        dataIndex: 0,
      },
    );
  }, [data.current]);

  const worstConversionRateMatch = useMemo(() => {
    return data.current.reduce(
      (acc, serie, serieIndex) => {
        const serieMin = serie.data.reduce(
          (minInSerie, item, dataIndex) => {
            if (item.rate < minInSerie.rate) {
              return { rate: item.rate, serieIndex, dataIndex };
            }
            return minInSerie;
          },
          { rate: 100, serieIndex, dataIndex: 0 },
        );

        return serieMin.rate < acc.rate ? serieMin : acc;
      },
      {
        rate: 100,
        serieIndex: 0,
        dataIndex: 0,
      },
    );
  }, [data.current]);
  const bestConversionRate =
    data.current[bestConversionRateMatch.serieIndex]?.data[
      bestConversionRateMatch.dataIndex
    ];
  const worstConversionRate =
    data.current[worstConversionRateMatch.serieIndex]?.data[
      worstConversionRateMatch.dataIndex
    ];

  const bestAverageConversionRateMatch = data.current.reduce(
    (acc, serie) => {
      const averageRate = average(serie.data.map((item) => item.rate));
      return averageRate > acc.averageRate ? { serie, averageRate } : acc;
    },
    { serie: data.current[0], averageRate: 0 },
  );
  const worstAverageConversionRateMatch = data.current.reduce(
    (acc, serie) => {
      const averageRate = average(serie.data.map((item) => item.rate));
      return averageRate < acc.averageRate ? { serie, averageRate } : acc;
    },
    { serie: data.current[0], averageRate: 100 },
  );

  const averageConversionRate = average(
    data.current.map((serie) => {
      return average(serie.data.map((item) => item.rate));
    }, 0),
  );

  const averageConversionRatePrevious =
    average(
      data.previous?.map((serie) => {
        return average(serie.data.map((item) => item.rate));
      }) ?? [],
    ) ?? 0;

  const sumConversions = data.current.reduce((acc, serie) => {
    return acc + sum(serie.data.map((item) => item.conversions));
  }, 0);
  const sumConversionsPrevious = data.previous?.reduce((acc, serie) => {
    return acc + sum(serie.data.map((item) => item.conversions));
  }, 0);

  const hasManySeries = data.current.length > 1;

  const getConversionRateNode = (
    item: RouterOutputs['chart']['conversion']['current'][0]['data'][0],
  ) => {
    const breakdowns = item.serie.breakdowns.join(', ');
    if (breakdowns) {
      return (
        <span className="text-muted-foreground">
          On{' '}
          <span className="text-foreground">
            {item.serie.breakdowns.join(', ')}
          </span>{' '}
          with{' '}
          <span className="text-foreground">
            {number.formatWithUnit(item.rate / 100, '%')}
          </span>{' '}
          at {formatDate(new Date(item.date))}
        </span>
      );
    }

    return (
      <span className="text-muted-foreground">
        <span className="text-foreground">
          {number.formatWithUnit(item.rate / 100, '%')}
        </span>{' '}
        at {formatDate(new Date(item.date))}
      </span>
    );
  };

  return (
    <Stats className="my-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      <StatsCard
        title="Flow"
        value={
          <div className="row flex-wrap gap-1">
            {report.series
              .filter((item) => item.type === 'event')
              .map((event, index) => {
                return (
                  <div key={event.id} className="row items-center gap-2">
                    {index !== 0 && <ChevronRightIcon className="size-3" />}
                    <span>{event.name}</span>
                  </div>
                );
              })}
          </div>
        }
      />
      {bestAverageConversionRateMatch && hasManySeries && (
        <StatsCard
          title="Best breakdown (avg)"
          value={
            <span>
              {bestAverageConversionRateMatch.serie?.breakdowns.join(', ')}{' '}
              <span className="text-muted-foreground">with</span>{' '}
              {number.formatWithUnit(
                bestAverageConversionRateMatch.averageRate / 100,
                '%',
              )}
            </span>
          }
        />
      )}
      {worstAverageConversionRateMatch && hasManySeries && (
        <StatsCard
          title="Worst breakdown (avg)"
          value={
            <span>
              {worstAverageConversionRateMatch.serie?.breakdowns.join(', ')}{' '}
              <span className="text-muted-foreground">with</span>{' '}
              {number.formatWithUnit(
                worstAverageConversionRateMatch.averageRate / 100,
                '%',
              )}
            </span>
          }
        />
      )}
      <StatsCard
        title="Average conversion rate"
        value={number.formatWithUnit(averageConversionRate / 100, '%')}
        enhancer={
          data.previous && (
            <PreviousDiffIndicatorPure
              {...getPreviousMetric(
                averageConversionRate,
                averageConversionRatePrevious,
              )}
            />
          )
        }
      />
      <StatsCard
        title="Total conversions"
        value={number.format(sumConversions)}
        enhancer={
          data.previous && (
            <PreviousDiffIndicatorPure
              {...getPreviousMetric(sumConversions, sumConversionsPrevious)}
            />
          )
        }
      />
      {bestConversionRate && (
        <StatsCard
          title="Best conversion rate"
          value={getConversionRateNode(bestConversionRate)}
        />
      )}
      {worstConversionRate && (
        <StatsCard
          title="Worst conversion rate"
          value={getConversionRateNode(worstConversionRate)}
        />
      )}
    </Stats>
  );
}

function TtcSummary({ data }: Props) {
  const { report } = useReportChartContext();

  const avgTtcValues = data.current.flatMap((serie) =>
    serie.data.filter((d) => d.ttc).map((d) => d.ttc!.avg),
  );
  const overallAvg =
    avgTtcValues.length > 0
      ? avgTtcValues.reduce((a, b) => a + b, 0) / avgTtcValues.length
      : 0;

  const allTtcValues = data.current.flatMap((serie) =>
    serie.data.filter((d) => d.ttc).map((d) => d.ttc!),
  );
  const fastest = allTtcValues.reduce(
    (min, ttc) => (ttc.min < min ? ttc.min : min),
    Number.POSITIVE_INFINITY,
  );
  const slowest = allTtcValues.reduce(
    (max, ttc) => (ttc.max > max ? ttc.max : max),
    0,
  );

  return (
    <Stats className="my-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      <StatsCard
        title="Flow"
        value={
          <div className="row flex-wrap gap-1">
            {report.series
              .filter((item) => item.type === 'event')
              .map((event, index) => (
                <div key={event.id} className="row items-center gap-2">
                  {index !== 0 && <ChevronRightIcon className="size-3" />}
                  <span>{event.name}</span>
                </div>
              ))}
          </div>
        }
      />
      <StatsCard
        title="Average time to convert"
        value={fancyMinutes(overallAvg)}
      />
      {fastest !== Number.POSITIVE_INFINITY && (
        <StatsCard
          title="Fastest conversion"
          value={fancyMinutes(fastest)}
        />
      )}
      {slowest > 0 && (
        <StatsCard
          title="Slowest conversion"
          value={fancyMinutes(slowest)}
        />
      )}
    </Stats>
  );
}
