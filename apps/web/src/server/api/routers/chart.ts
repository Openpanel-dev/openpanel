import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import type { IChartEvent, IChartInput, IChartRange } from '@/types';
import { getDaysOldDate } from '@/utils/date';
import { average, max, min, round, sum } from '@/utils/math';
import { zChartInput } from '@/utils/validation';
import { flatten, map, pipe, prop, sort, uniq } from 'ramda';
import { z } from 'zod';

import { chQuery } from '@mixan/db';

import { getChartData, withFormula } from './chart.helpers';

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

interface FinalChart {
  events: IChartInput['events'];
  series: {
    name: string;
    event: IChartEvent;
    metrics: Metrics;
    data: {
      date: string;
      count: number;
      label: string | null;
      previous: PreviousValue;
    }[];
  }[];
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

  values: protectedProcedure
    .input(
      z.object({
        event: z.string(),
        property: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input: { event, property, projectId } }) => {
      const sql = property.startsWith('properties.')
        ? `SELECT distinct mapValues(mapExtractKeyLike(properties, '${property
            .replace(/^properties\./, '')
            .replace(
              '.*.',
              '.%.'
            )}')) as values from events where name = '${event}' AND project_id = '${projectId}';`
        : `SELECT ${property} as values from events where name = '${event}' AND project_id = '${projectId}';`;

      const events = await chQuery<{ values: string[] }>(sql);

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

  chart: protectedProcedure.input(zChartInput).query(async ({ input }) => {
    const current = getDatesFromRange(input.range);
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
              new Date(current.startDate).getTime() - diff
            ).toISOString(),
            endDate: new Date(
              new Date(current.endDate).getTime() - diff
            ).toISOString(),
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
  // .sort((a, b) => {
  //   if (input.chartType === 'linear') {
  //     const sumA = a.data.reduce((acc, item) => acc + (item.count ?? 0), 0);
  //     const sumB = b.data.reduce((acc, item) => acc + (item.count ?? 0), 0);
  //     return sumB - sumA;
  //   } else {
  //     return b.metrics.sum - a.metrics.sum;
  //   }
  // });
}

function getDatesFromRange(range: IChartRange) {
  if (range === 'today') {
    const startDate = new Date();
    const endDate = new Date();
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);

    return {
      startDate: startDate.toUTCString(),
      endDate: endDate.toUTCString(),
    };
  }

  if (range === '30min' || range === '1h') {
    const startDate = new Date(
      Date.now() - 1000 * 60 * (range === '30min' ? 30 : 60)
    ).toUTCString();
    const endDate = new Date().toUTCString();

    return {
      startDate,
      endDate,
    };
  }

  let days = 1;

  if (range === '24h') {
    days = 1;
  } else if (range === '7d') {
    days = 7;
  } else if (range === '14d') {
    days = 14;
  } else if (range === '1m') {
    days = 30;
  } else if (range === '3m') {
    days = 90;
  } else if (range === '6m') {
    days = 180;
  } else if (range === '1y') {
    days = 365;
  }

  const startDate = getDaysOldDate(days);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date();
  endDate.setUTCHours(23, 59, 59, 999);
  return {
    startDate: startDate.toUTCString(),
    endDate: endDate.toUTCString(),
  };
}
