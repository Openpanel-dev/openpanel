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
import { useTranslation } from 'react-i18next';
import { useReportChartContext } from '../context';

const SUMMARY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  flow: GitBranch,
  average_conversion_rate: Percent,
  total_conversions: Target,
  previous_average_conversion_rate: Percent,
  previous_total_conversions: Hash,
  best_breakdown_average: Trophy,
  worst_breakdown_average: ArrowDownRight,
  best_conversion_rate: ArrowUpRight,
  worst_conversion_rate: ArrowDownRight,
};

interface Props {
  data: RouterOutputs['chart']['conversion'];
}

export function Summary({ data }: Props) {
  const { t } = useTranslation();
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
    const items: { id: string; name: string; value: React.ReactNode }[] = [
      { id: 'flow', name: t('report_chart.summary_flow'), value: flowLabel },
      {
        id: 'average_conversion_rate',
        name: t('report_chart.summary_average_conversion_rate'),
        value: number.formatWithUnit(averageConversionRate / 100, '%'),
      },
      {
        id: 'total_conversions',
        name: t('report_chart.summary_total_conversions'),
        value: sumConversions,
      },
    ];
    if (data.previous != null) {
      items.push(
        {
          id: 'previous_average_conversion_rate',
          name: t('report_chart.summary_previous_average_conversion_rate'),
          value: number.formatWithUnit(
            averageConversionRatePrevious / 100,
            '%',
          ),
        },
        {
          id: 'previous_total_conversions',
          name: t('report_chart.summary_previous_total_conversions'),
          value: sumConversionsPrevious ?? 0,
        },
      );
    }
    if (hasManySeries && bestAverageConversionRateMatch) {
      items.push({
        id: 'best_breakdown_average',
        name: t('report_chart.summary_best_breakdown_average'),
        value: t('report_chart.summary_breakdown_with_rate', {
          breakdown: bestAverageConversionRateMatch.serie?.breakdowns.join(', '),
          rate: number.formatWithUnit(
            bestAverageConversionRateMatch.averageRate / 100,
            '%',
          ),
        }),
      });
    }
    if (hasManySeries && worstAverageConversionRateMatch) {
      items.push({
        id: 'worst_breakdown_average',
        name: t('report_chart.summary_worst_breakdown_average'),
        value: t('report_chart.summary_breakdown_with_rate', {
          breakdown: worstAverageConversionRateMatch.serie?.breakdowns.join(', '),
          rate: number.formatWithUnit(
            worstAverageConversionRateMatch.averageRate / 100,
            '%',
          ),
        }),
      });
    }
    if (bestConversionRate) {
      const breakdowns = bestConversionRate.serie.breakdowns.join(', ');
      items.push({
        id: 'best_conversion_rate',
        name: t('report_chart.summary_best_conversion_rate'),
        value: breakdowns
          ? t('report_chart.summary_rate_on_breakdown_at_date', {
              rate: number.formatWithUnit(bestConversionRate.rate / 100, '%'),
              breakdown: breakdowns,
              date: formatDate(new Date(bestConversionRate.date)),
            })
          : t('report_chart.summary_rate_at_date', {
              rate: number.formatWithUnit(bestConversionRate.rate / 100, '%'),
              date: formatDate(new Date(bestConversionRate.date)),
            }),
      });
    }
    if (worstConversionRate) {
      const breakdowns = worstConversionRate.serie.breakdowns.join(', ');
      items.push({
        id: 'worst_conversion_rate',
        name: t('report_chart.summary_worst_conversion_rate'),
        value: breakdowns
          ? t('report_chart.summary_rate_on_breakdown_at_date', {
              rate: number.formatWithUnit(worstConversionRate.rate / 100, '%'),
              breakdown: breakdowns,
              date: formatDate(new Date(worstConversionRate.date)),
            })
          : t('report_chart.summary_rate_at_date', {
              rate: number.formatWithUnit(worstConversionRate.rate / 100, '%'),
              date: formatDate(new Date(worstConversionRate.date)),
            }),
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
    t,
  ]);

  return (
    <div className="my-4 space-y-3">
      <div className="row flex-wrap gap-2">
        {keyValueData.map((item) => {
          const Icon = SUMMARY_ICONS[item.id];
          return (
            <div
              key={item.id}
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
