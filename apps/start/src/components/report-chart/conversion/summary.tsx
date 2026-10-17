import { average, sum } from '@openpanel/shared';
import { useMemo } from 'react';
import { getPreviousMetric } from '../../../utils/previous-metric';
import { PreviousDiffIndicatorPure } from '../common/previous-diff-indicator';
import { SerieIcon } from '../common/serie-icon';
import { Stat, StatStrip } from '../common/stat-strip';
import { useReportChartContext } from '../context';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/date';

type ConversionData = RouterOutputs['chart']['conversion'];
type Serie = ConversionData['current'][number];
type Point = Serie['data'][number];

interface Props {
  data: ConversionData;
}

interface DayMatch {
  serie: Serie;
  point: Point;
}

const averageRate = (serie: { data: { rate: number }[] }) =>
  average(
    serie.data.map((item) => item.rate),
    true
  );

/** The report's headline numbers: overall conversion, how many converted, and the best and worst day and breakdown. */
export function Summary({ data }: Props) {
  const number = useNumber();
  const { report } = useReportChartContext();
  const hasBreakdowns = data.current.length > 1;
  const flow = report.series
    .filter((item) => item.type === 'event')
    .map((item) => item.displayName || item.name)
    .join(' → ');

  const stats = useMemo(() => {
    const conversions = sumOf(data.current, 'conversions');
    const opportunities = sumOf(data.current, 'total');
    const previousConversions = data.previous?.length
      ? sumOf(data.previous, 'conversions')
      : null;
    const previousOpportunities = data.previous?.length
      ? sumOf(data.previous, 'total')
      : null;
    // Conversions over opportunities, not a mean of daily rates: a day with
    // one visitor should not weigh as much as a day with a hundred.
    const rate = overallRate(conversions, opportunities);
    const previousRate =
      previousConversions === null || previousOpportunities === null
        ? null
        : overallRate(previousConversions, previousOpportunities);
    const days = data.current.flatMap((serie) =>
      serie.data
        .filter((point) => point.total > 0)
        .map((point): DayMatch => ({ serie, point }))
    );
    const bySerie = [...data.current].sort(
      (a, b) => averageRate(b) - averageRate(a)
    );
    return {
      rate,
      previousRate,
      conversions,
      previousConversions,
      opportunities,
      bestDay: maxBy(days, (day) => day.point.rate),
      worstDay: minBy(days, (day) => day.point.rate),
      bestSerie: bySerie[0],
      worstSerie: bySerie.at(-1),
    };
  }, [data]);

  const formatRate = (value: number) => number.formatWithUnit(value / 100, '%');

  return (
    <StatStrip
      className={cn('md:grid-cols-4', hasBreakdowns && 'lg:grid-cols-6')}
    >
      <Stat
        change={
          stats.previousRate !== null && (
            <PreviousDiffIndicatorPure
              {...getPreviousMetric(stats.rate, stats.previousRate)}
              size="xs"
            />
          )
        }
        detail={flow}
        label="Conversion"
        value={formatRate(stats.rate)}
      />
      <Stat
        change={
          stats.previousConversions !== null && (
            <PreviousDiffIndicatorPure
              {...getPreviousMetric(
                stats.conversions,
                stats.previousConversions
              )}
              size="xs"
            />
          )
        }
        detail={`of ${number.format(stats.opportunities)} opportunities`}
        label="Conversions"
        value={number.format(stats.conversions)}
      />
      <Stat
        detail={stats.bestDay && <DayDetail match={stats.bestDay} />}
        label="Best day"
        value={stats.bestDay ? formatRate(stats.bestDay.point.rate) : '–'}
      />
      <Stat
        detail={stats.worstDay && <DayDetail match={stats.worstDay} />}
        label="Worst day"
        value={stats.worstDay ? formatRate(stats.worstDay.point.rate) : '–'}
      />
      {hasBreakdowns && stats.bestSerie && (
        <Stat
          detail={<Breakdown serie={stats.bestSerie} />}
          label="Best breakdown"
          value={formatRate(averageRate(stats.bestSerie))}
        />
      )}
      {hasBreakdowns && stats.worstSerie && (
        <Stat
          detail={<Breakdown serie={stats.worstSerie} />}
          label="Worst breakdown"
          value={formatRate(averageRate(stats.worstSerie))}
        />
      )}
    </StatStrip>
  );
}

function DayDetail({ match }: { match: DayMatch }) {
  const hasBreakdown = match.serie.breakdowns.length > 0;
  return (
    <>
      {formatDate(new Date(match.point.date))}
      {hasBreakdown && (
        <>
          <span>·</span>
          <Breakdown serie={match.serie} />
        </>
      )}
    </>
  );
}

function Breakdown({ serie }: { serie: Serie }) {
  return (
    <>
      <SerieIcon name={serie.breakdowns} />
      <span className="truncate">{serie.breakdowns.join(' › ')}</span>
    </>
  );
}

function sumOf(
  series: { data: { conversions: number; total: number }[] }[],
  key: 'conversions' | 'total'
) {
  return sum(series.flatMap((serie) => serie.data.map((item) => item[key])));
}

function overallRate(conversions: number, opportunities: number) {
  return opportunities > 0 ? (conversions / opportunities) * 100 : 0;
}

function maxBy<T>(items: T[], score: (item: T) => number) {
  return items.reduce<T | undefined>(
    (best, item) =>
      best === undefined || score(item) > score(best) ? item : best,
    undefined
  );
}

function minBy<T>(items: T[], score: (item: T) => number) {
  return items.reduce<T | undefined>(
    (worst, item) =>
      worst === undefined || score(item) < score(worst) ? item : worst,
    undefined
  );
}
