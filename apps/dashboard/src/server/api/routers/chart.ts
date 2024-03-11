import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '@/server/api/trpc';
import { average, max, min, round, sum } from '@/utils/math';
import {
  chQuery,
  createSqlBuilder,
  formatClickhouseDate,
  getEventFiltersWhereClause,
} from '@openpanel/db';
import { zChartInput } from '@openpanel/validation';
import type { IChartEvent, IChartInput } from '@openpanel/validation';
import { flatten, map, pipe, prop, repeat, reverse, sort, uniq } from 'ramda';
import { z } from 'zod';

import {
  getChartData,
  getChartStartEndDate,
  getDatesFromRange,
  withFormula,
} from './chart.helpers';

async function getFunnelData({ projectId, ...payload }: IChartInput) {
  const { startDate, endDate } = getChartStartEndDate(payload);

  if (payload.events.length === 0) {
    return {
      totalSessions: 0,
      steps: [],
    };
  }

  const funnels = payload.events.map((event) => {
    const { sb, getWhere } = createSqlBuilder();
    sb.where = getEventFiltersWhereClause(event.filters);
    sb.where.name = `name = '${event.name}'`;
    return getWhere().replace('WHERE ', '');
  });

  const innerSql = `SELECT
    session_id,
    windowFunnel(6048000000000000,'strict_increase')(toUnixTimestamp(created_at), ${funnels.join(', ')}) AS level
  FROM events
  WHERE (project_id = '${projectId}' AND created_at >= '${formatClickhouseDate(startDate)}') AND (created_at <= '${formatClickhouseDate(endDate)}')
  GROUP BY session_id;`;

  const sql = `SELECT level, count() AS count FROM (${innerSql}) GROUP BY level ORDER BY level DESC;`;

  const [funnelRes, sessionRes] = await Promise.all([
    chQuery<{ level: number; count: number }>(sql),
    chQuery<{ count: number }>(
      `SELECT count(name) as count FROM events WHERE project_id = '${projectId}' AND name = 'session_start' AND (created_at >= '${formatClickhouseDate(startDate)}') AND (created_at <= '${formatClickhouseDate(endDate)}')`
    ),
  ]);

  console.log('Funnel SQL: ', sql);

  if (funnelRes[0]?.level !== payload.events.length) {
    funnelRes.unshift({
      level: payload.events.length,
      count: 0,
    });
  }

  const totalSessions = sessionRes[0]?.count ?? 0;
  const filledFunnelRes = funnelRes.reduce(
    (acc, item, index) => {
      const diff =
        index !== 0 ? (acc[acc.length - 1]?.level ?? 0) - item.level : 1;

      if (diff > 1) {
        acc.push(
          ...reverse(
            repeat({}, diff - 1).map((_, index) => ({
              count: acc[acc.length - 1]?.count ?? 0,
              level: item.level + index + 1,
            }))
          )
        );
      }

      return [
        ...acc,
        {
          count: item.count + (acc[acc.length - 1]?.count ?? 0),
          level: item.level,
        },
      ];
    },
    [] as typeof funnelRes
  );

  const steps = reverse(filledFunnelRes)
    .filter((item) => item.level !== 0)
    .reduce(
      (acc, item, index, list) => {
        const prev = list[index - 1] ?? { count: totalSessions };
        return [
          ...acc,
          {
            event: payload.events[item.level - 1]!,
            before: prev.count,
            current: item.count,
            dropoff: {
              count: prev.count - item.count,
              percent: 100 - (item.count / prev.count) * 100,
            },
            percent: (item.count / totalSessions) * 100,
            prevPercent: (prev.count / totalSessions) * 100,
          },
        ];
      },
      [] as {
        event: IChartEvent;
        before: number;
        current: number;
        dropoff: {
          count: number;
          percent: number;
        };
        percent: number;
        prevPercent: number;
      }[]
    );

  return {
    totalSessions,
    steps,
  };
}

type PreviousValue = {
  value: number;
  diff: number | null;
  state: 'positive' | 'negative' | 'neutral';
} | null;

interface Metrics {
  sum: number;
  average: number;
  min: number;
  max: number;
  previous: {
    sum: PreviousValue;
    average: PreviousValue;
    min: PreviousValue;
    max: PreviousValue;
  };
}

export interface IChartSerie {
  name: string;
  event: IChartEvent;
  metrics: Metrics;
  data: {
    date: string;
    count: number;
    label: string | null;
    previous: PreviousValue;
  }[];
}

export interface FinalChart {
  events: IChartInput['events'];
  series: IChartSerie[];
  metrics: Metrics;
}

export const chartRouter = createTRPCRouter({
  events: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId } }) => {
      const events = await chQuery<{ name: string }>(
        `SELECT DISTINCT name FROM events WHERE project_id = '${projectId}'`
      );

      return [
        {
          name: '*',
        },
        ...events,
      ];
    }),

  properties: protectedProcedure
    .input(z.object({ event: z.string().optional(), projectId: z.string() }))
    .query(async ({ input: { projectId, event } }) => {
      const events = await chQuery<{ keys: string[] }>(
        `SELECT distinct mapKeys(properties) as keys from events where ${
          event && event !== '*' ? `name = '${event}' AND ` : ''
        } project_id = '${projectId}';`
      );

      const properties = events
        .flatMap((event) => event.keys)
        .map((item) => item.replace(/\.([0-9]+)\./g, '.*.'))
        .map((item) => item.replace(/\.([0-9]+)/g, '[*]'))
        .map((item) => `properties.${item}`);

      properties.push(
        'name',
        'path',
        'referrer',
        'referrer_name',
        'duration',
        'created_at',
        'country',
        'city',
        'region',
        'os',
        'os_version',
        'browser',
        'browser_version',
        'device',
        'brand',
        'model'
      );

      return pipe(
        sort<string>((a, b) => a.length - b.length),
        uniq
      )(properties);
    }),

  // TODO: Make this private
  values: publicProcedure
    .input(
      z.object({
        event: z.string(),
        property: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input: { event, property, projectId } }) => {
      const { sb, getSql } = createSqlBuilder();
      sb.where.project_id = `project_id = '${projectId}'`;
      if (event !== '*') {
        sb.where.event = `name = '${event}'`;
      }
      if (property.startsWith('properties.')) {
        sb.select.values = `distinct mapValues(mapExtractKeyLike(properties, '${property
          .replace(/^properties\./, '')
          .replace('.*.', '.%.')}')) as values`;
      } else {
        sb.select.values = `${property} as values`;
      }

      const events = await chQuery<{ values: string[] }>(getSql());

      const values = pipe(
        (data: typeof events) => map(prop('values'), data),
        flatten,
        uniq,
        sort((a, b) => a.length - b.length)
      )(events);

      return {
        values,
      };
    }),

  funnel: publicProcedure.input(zChartInput).query(async ({ input }) => {
    return getFunnelData(input);
  }),

  // TODO: Make this private
  chart: publicProcedure.input(zChartInput).query(async ({ input }) => {
    const { startDate, endDate } = getChartStartEndDate(input);
    let diff = 0;

    switch (input.range) {
      case '30min': {
        diff = 1000 * 60 * 30;
        break;
      }
      case '1h': {
        diff = 1000 * 60 * 60;
        break;
      }
      case '24h':
      case 'today': {
        diff = 1000 * 60 * 60 * 24;
        break;
      }
      case '7d': {
        diff = 1000 * 60 * 60 * 24 * 7;
        break;
      }
      case '14d': {
        diff = 1000 * 60 * 60 * 24 * 14;
        break;
      }
      case '1m': {
        diff = 1000 * 60 * 60 * 24 * 30;
        break;
      }
      case '3m': {
        diff = 1000 * 60 * 60 * 24 * 90;
        break;
      }
      case '6m': {
        diff = 1000 * 60 * 60 * 24 * 180;
        break;
      }
    }

    const promises = [getSeriesFromEvents(input)];

    if (input.previous) {
      promises.push(
        getSeriesFromEvents({
          ...input,
          ...{
            startDate: new Date(
              new Date(startDate).getTime() - diff
            ).toISOString(),
            endDate: new Date(new Date(endDate).getTime() - diff).toISOString(),
          },
        })
      );
    }

    const result = await Promise.all(promises);
    const series = result[0]!;
    const previousSeries = result[1];

    const final: FinalChart = {
      events: input.events,
      series: series.map((serie, index) => {
        const previousSerie = previousSeries?.[index];
        const metrics = {
          sum: sum(serie.data.map((item) => item.count)),
          average: round(average(serie.data.map((item) => item.count)), 2),
          min: min(serie.data.map((item) => item.count)),
          max: max(serie.data.map((item) => item.count)),
        };

        return {
          name: serie.name,
          event: serie.event,
          metrics: {
            ...metrics,
            previous: {
              sum: getPreviousMetric(
                metrics.sum,
                previousSerie
                  ? sum(previousSerie?.data.map((item) => item.count))
                  : null
              ),
              average: getPreviousMetric(
                metrics.average,
                previousSerie
                  ? round(
                      average(previousSerie?.data.map((item) => item.count)),
                      2
                    )
                  : null
              ),
              min: getPreviousMetric(
                metrics.sum,
                previousSerie
                  ? min(previousSerie?.data.map((item) => item.count))
                  : null
              ),
              max: getPreviousMetric(
                metrics.sum,
                previousSerie
                  ? max(previousSerie?.data.map((item) => item.count))
                  : null
              ),
            },
          },
          data: serie.data.map((item, index) => ({
            date: item.date,
            count: item.count ?? 0,
            label: item.label,
            previous: previousSerie?.data[index]
              ? getPreviousMetric(
                  item.count ?? 0,
                  previousSerie?.data[index]?.count ?? null
                )
              : null,
          })),
        };
      }),
      metrics: {
        sum: 0,
        average: 0,
        min: 0,
        max: 0,
        previous: {
          sum: null,
          average: null,
          min: null,
          max: null,
        },
      },
    };

    final.metrics.sum = sum(final.series.map((item) => item.metrics.sum));
    final.metrics.average = round(
      average(final.series.map((item) => item.metrics.average)),
      2
    );
    final.metrics.min = min(final.series.map((item) => item.metrics.min));
    final.metrics.max = max(final.series.map((item) => item.metrics.max));
    final.metrics.previous = {
      sum: getPreviousMetric(
        sum(final.series.map((item) => item.metrics.sum)),
        sum(final.series.map((item) => item.metrics.previous.sum?.value ?? 0))
      ),
      average: getPreviousMetric(
        round(average(final.series.map((item) => item.metrics.average)), 2),
        round(
          average(
            final.series.map(
              (item) => item.metrics.previous.average?.value ?? 0
            )
          ),
          2
        )
      ),
      min: getPreviousMetric(
        min(final.series.map((item) => item.metrics.min)),
        min(final.series.map((item) => item.metrics.previous.min?.value ?? 0))
      ),
      max: getPreviousMetric(
        max(final.series.map((item) => item.metrics.max)),
        max(final.series.map((item) => item.metrics.previous.max?.value ?? 0))
      ),
    };

    final.series = final.series.sort((a, b) => {
      if (input.chartType === 'linear') {
        const sumA = a.data.reduce((acc, item) => acc + (item.count ?? 0), 0);
        const sumB = b.data.reduce((acc, item) => acc + (item.count ?? 0), 0);
        return sumB - sumA;
      } else {
        return b.metrics[input.metric] - a.metrics[input.metric];
      }
    });

    // await new Promise((res) => {
    //   setTimeout(() => {
    //     res();
    //   }, 100);
    // });
    return final;
  }),
});

function getPreviousMetric(
  current: number,
  previous: number | null
): PreviousValue {
  if (previous === null) {
    return null;
  }

  const diff = round(
    ((current > previous
      ? current / previous
      : current < previous
        ? previous / current
        : 0) -
      1) *
      100,
    1
  );

  return {
    diff:
      Number.isNaN(diff) || !Number.isFinite(diff) || current === previous
        ? null
        : diff,
    state:
      current > previous
        ? 'positive'
        : current < previous
          ? 'negative'
          : 'neutral',
    value: previous,
  };
}

async function getSeriesFromEvents(input: IChartInput) {
  const { startDate, endDate } =
    input.startDate && input.endDate
      ? {
          startDate: input.startDate,
          endDate: input.endDate,
        }
      : getDatesFromRange(input.range);

  const series = (
    await Promise.all(
      input.events.map(async (event) =>
        getChartData({
          ...input,
          startDate,
          endDate,
          event,
        })
      )
    )
  ).flat();

  return withFormula(input, series);
}
