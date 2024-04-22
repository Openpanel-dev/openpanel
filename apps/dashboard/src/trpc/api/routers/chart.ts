import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '@/trpc/api/trpc';
import { average, max, min, round, sum } from '@/utils/math';
import { flatten, map, pipe, prop, sort, uniq } from 'ramda';
import { escape } from 'sqlstring';
import { z } from 'zod';

import { chQuery, createSqlBuilder } from '@openpanel/db';
import { zChartInput } from '@openpanel/validation';
import type { IChartEvent, IChartInput } from '@openpanel/validation';

import {
  getChartPrevStartEndDate,
  getChartStartEndDate,
  getFunnelData,
  getFunnelStep,
  getSeriesFromEvents,
} from './chart.helpers';

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
        `SELECT DISTINCT name FROM events WHERE project_id = ${escape(projectId)}`
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
          event && event !== '*' ? `name = ${escape(event)} AND ` : ''
        } project_id = ${escape(projectId)};`
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
      sb.where.project_id = `project_id = ${escape(projectId)}`;
      if (event !== '*') {
        sb.where.event = `name = ${escape(event)}`;
      }
      if (property.startsWith('properties.')) {
        sb.select.values = `distinct mapValues(mapExtractKeyLike(properties, ${escape(
          property.replace(/^properties\./, '').replace('.*.', '.%.')
        )})) as values`;
      } else {
        sb.select.values = `distinct ${property} as values`;
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
    const currentPeriod = getChartStartEndDate(input);
    const previousPeriod = getChartPrevStartEndDate({
      range: input.range,
      ...currentPeriod,
    });

    const [current, previous] = await Promise.all([
      getFunnelData({ ...input, ...currentPeriod }),
      getFunnelData({ ...input, ...previousPeriod }),
    ]);

    return {
      current,
      previous,
    };
  }),

  funnelStep: publicProcedure
    .input(
      zChartInput.extend({
        step: z.number(),
      })
    )
    .query(async ({ input }) => {
      const currentPeriod = getChartStartEndDate(input);
      return getFunnelStep({ ...input, ...currentPeriod });
    }),

  // TODO: Make this private
  chart: publicProcedure.input(zChartInput).query(async ({ input }) => {
    const currentPeriod = getChartStartEndDate(input);
    const previousPeriod = getChartPrevStartEndDate({
      range: input.range,
      ...currentPeriod,
    });

    const promises = [getSeriesFromEvents({ ...input, ...currentPeriod })];

    if (input.previous) {
      promises.push(
        getSeriesFromEvents({
          ...input,
          ...previousPeriod,
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
          event: {
            ...serie.event,
            displayName: serie.event.displayName ?? serie.event.name,
          },
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
        final.metrics.sum,
        sum(final.series.map((item) => item.metrics.previous.sum?.value ?? 0))
      ),
      average: getPreviousMetric(
        final.metrics.average,
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
        final.metrics.min,
        min(final.series.map((item) => item.metrics.previous.min?.value ?? 0))
      ),
      max: getPreviousMetric(
        final.metrics.max,
        max(final.series.map((item) => item.metrics.previous.max?.value ?? 0))
      ),
    };

    // Sort by sum
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

export function getPreviousMetric(
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
