import type { RouterOutputs } from '@/trpc/client';
import type React from 'react';
import { useMemo } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  GitBranch,
  Hash,
  Percent,
  Target,
  Trophy,
} from 'lucide-react';

import { useNumber } from '@/hooks/use-numer-formatter';
import { formatDate } from '@/utils/date';
import { average, sum } from '@openpanel/common';
import { useReportChartContext } from '../context';

const SUMMARY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Flow: GitBranch,
  'Average conversion rate': Percent,
  'Total conversions': Target,
  'Previous period average conversion rate': Percent,
  'Previous period total conversions': Hash,
  'Best breakdown (avg)': Trophy,
  'Worst breakdown (avg)': ArrowDownRight,
  'Best conversion rate': ArrowUpRight,
  'Worst conversion rate': ArrowDownRight,
};

interface Props {
  data: RouterOutputs['chart']['conversion'];
}

export function Summary({ data }: Props) {
  const number = useNumber();
  const { report } = useReportChartContext();

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

  const keyValueData = useMemo(() => {
    const flowLabel = report.series
      .filter((item) => item.type === 'event')
      .map((e) => e.displayName || e.name)
      .join(' → ');
    const items: { name: string; value: React.ReactNode }[] = [
      { name: 'Flow', value: flowLabel },
      {
        name: 'Average conversion rate',
        value: number.formatWithUnit(averageConversionRate / 100, '%'),
      },
      { name: 'Total conversions', value: sumConversions },
    ];
    if (data.previous != null) {
      items.push(
        {
          name: 'Previous period average conversion rate',
          value: number.formatWithUnit(
            averageConversionRatePrevious / 100,
            '%',
          ),
        },
        {
          name: 'Previous period total conversions',
          value: sumConversionsPrevious ?? 0,
        },
      );
    }
    if (hasManySeries && bestAverageConversionRateMatch) {
      items.push({
        name: 'Best breakdown (avg)',
        value: `${bestAverageConversionRateMatch.serie?.breakdowns.join(', ')} with ${number.formatWithUnit(bestAverageConversionRateMatch.averageRate / 100, '%')}`,
      });
    }
    if (hasManySeries && worstAverageConversionRateMatch) {
      items.push({
        name: 'Worst breakdown (avg)',
        value: `${worstAverageConversionRateMatch.serie?.breakdowns.join(', ')} with ${number.formatWithUnit(worstAverageConversionRateMatch.averageRate / 100, '%')}`,
      });
    }
    if (bestConversionRate) {
      const breakdowns = bestConversionRate.serie.breakdowns.join(', ');
      items.push({
        name: 'Best conversion rate',
        value: breakdowns
          ? `${number.formatWithUnit(bestConversionRate.rate / 100, '%')} on ${breakdowns} at ${formatDate(new Date(bestConversionRate.date))}`
          : `${number.formatWithUnit(bestConversionRate.rate / 100, '%')} at ${formatDate(new Date(bestConversionRate.date))}`,
      });
    }
    if (worstConversionRate) {
      const breakdowns = worstConversionRate.serie.breakdowns.join(', ');
      items.push({
        name: 'Worst conversion rate',
        value: breakdowns
          ? `${number.formatWithUnit(worstConversionRate.rate / 100, '%')} on ${breakdowns} at ${formatDate(new Date(worstConversionRate.date))}`
          : `${number.formatWithUnit(worstConversionRate.rate / 100, '%')} at ${formatDate(new Date(worstConversionRate.date))}`,
      });
    }
    return items;
  }, [
    report.series,
    averageConversionRate,
    sumConversions,
    data.previous,
    averageConversionRatePrevious,
    sumConversionsPrevious,
    hasManySeries,
    bestAverageConversionRateMatch,
    worstAverageConversionRateMatch,
    bestConversionRate,
    worstConversionRate,
    number,
  ]);

  return (
    <div className="my-4 space-y-3">
      <div className="row flex-wrap gap-2">
        {keyValueData.map((item) => {
          const Icon = SUMMARY_ICONS[item.name];
          return (
            <div
              key={item.name}
              className="card row items-center justify-between p-4 py-3 font-medium gap-4"
            >
              <span className="text-muted-foreground row items-center gap-2">
                {Icon != null && <Icon className="size-4 shrink-0" />}
                {item.name}
              </span>
              <span>{item.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
