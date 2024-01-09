import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import * as cache from '@/server/cache';
import { getChartSql } from '@/server/chart-sql/getChartSql';
import { isJsonPath, selectJsonPath } from '@/server/chart-sql/helpers';
import { db } from '@/server/db';
import { getUniqueEvents } from '@/server/services/event.service';
import { getProjectBySlug } from '@/server/services/project.service';
import type {
  IChartEvent,
  IChartRange,
  IGetChartDataInput,
  IInterval,
} from '@/types';
import { getDaysOldDate } from '@/utils/date';
import { average, isFloat, round, sum } from '@/utils/math';
import { toDots } from '@/utils/object';
import { zChartInputWithDates } from '@/utils/validation';
import { last, pipe, sort, uniq } from 'ramda';
import { z } from 'zod';

export const chartRouter = createTRPCRouter({
  events: protectedProcedure
    .input(z.object({ projectSlug: z.string() }))
    .query(async ({ input: { projectSlug } }) => {
      const project = await getProjectBySlug(projectSlug);
      const events = await cache.getOr(
        `events_${project.id}`,
        1000 * 60 * 60 * 24,
        () => getUniqueEvents({ projectId: project.id })
      );

      return [
        {
          name: '*',
        },
        ...events,
      ];
    }),

  properties: protectedProcedure
    .input(z.object({ event: z.string().optional(), projectSlug: z.string() }))
    .query(async ({ input: { projectSlug, event } }) => {
      const project = await getProjectBySlug(projectSlug);
      const events = await cache.getOr(
        `events_${project.id}_${event ?? 'all'}`,
        1000 * 60 * 60,
        () =>
          db.event.findMany({
            take: 500,
            where: {
              project_id: project.id,
              ...(event
                ? {
                    name: event,
                  }
                : {}),
            },
          })
      );

      const properties = events
        .reduce((acc, event) => {
          const properties = event as Record<string, unknown>;
          const dotNotation = toDots(properties);
          return [...acc, ...Object.keys(dotNotation)];
        }, [] as string[])
        .map((item) => item.replace(/\.([0-9]+)\./g, '.*.'))
        .map((item) => item.replace(/\.([0-9]+)/g, '[*]'));

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
        projectSlug: z.string(),
      })
    )
    .query(async ({ input: { event, property, projectSlug } }) => {
      const intervalInDays = 180;
      const project = await getProjectBySlug(projectSlug);
      if (isJsonPath(property)) {
        const events = await db.$queryRawUnsafe<{ value: string }[]>(
          `SELECT ${selectJsonPath(
            property
          )} AS value from events WHERE project_id = '${
            project.id
          }' AND name = '${event}' AND "createdAt" >= NOW() - INTERVAL '${intervalInDays} days'`
        );

        return {
          values: uniq(events.map((item) => item.value)),
        };
      } else {
        const events = await db.event.findMany({
          where: {
            project_id: project.id,
            name: event,
            [property]: {
              not: null,
            },
            createdAt: {
              gte: new Date(
                new Date().getTime() - 1000 * 60 * 60 * 24 * intervalInDays
              ),
            },
          },
          distinct: property as any,
          select: {
            [property]: true,
          },
        });

        return {
          values: uniq(events.map((item) => item[property]!)),
        };
      }
    }),

  chart: protectedProcedure
    .input(zChartInputWithDates.merge(z.object({ projectSlug: z.string() })))
    .query(async ({ input: { projectSlug, events, ...input } }) => {
      const { startDate, endDate } =
        input.startDate && input.endDate
          ? {
              startDate: input.startDate,
              endDate: input.endDate,
            }
          : getDatesFromRange(input.range);
      const project = await getProjectBySlug(projectSlug);
      const series: Awaited<ReturnType<typeof getChartData>> = [];
      for (const event of events) {
        series.push(
          ...(await getChartData({
            ...input,
            startDate,
            endDate,
            event,
            projectId: project.id,
          }))
        );
      }

      const sorted = [...series].sort((a, b) => {
        if (input.chartType === 'linear') {
          const sumA = a.data.reduce((acc, item) => acc + item.count, 0);
          const sumB = b.data.reduce((acc, item) => acc + item.count, 0);
          return sumB - sumA;
        } else {
          return b.metrics.total - a.metrics.total;
        }
      });

      const meta = {
        highest: sorted[0]?.metrics.total ?? 0,
        lowest: last(sorted)?.metrics.total ?? 0,
      };

      return {
        events: Object.entries(
          series.reduce(
            (acc, item) => {
              if (acc[item.event.id]) {
                acc[item.event.id] += item.metrics.total;
              } else {
                acc[item.event.id] = item.metrics.total;
              }
              return acc;
            },
            {} as Record<(typeof series)[number]['event']['id'], number>
          )
        ).map(([id, count]) => ({
          count,
          ...events.find((event) => event.id === id)!,
        })),
        series: sorted.map((item) => ({
          ...item,
          meta,
        })),
      };
    }),
});

interface ResultItem {
  label: string | null;
  count: number;
  date: string;
}

function getEventLegend(event: IChartEvent) {
  return event.displayName ?? `${event.name} (${event.id})`;
}

function getDatesFromRange(range: IChartRange) {
  if (range === 'today') {
    const startDate = new Date();
    const endDate = new Date().toISOString();
    startDate.setHours(0, 0, 0, 0);

    return {
      startDate: startDate.toISOString(),
      endDate: endDate,
    };
  }

  if (range === '30min' || range === '1h') {
    const startDate = new Date(
      Date.now() - 1000 * 60 * (range === '30min' ? 30 : 60)
    ).toISOString();
    const endDate = new Date().toISOString();

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
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

async function getChartData(payload: IGetChartDataInput) {
  let result = await db.$queryRawUnsafe<ResultItem[]>(getChartSql(payload));

  if (result.length === 0 && payload.breakdowns.length > 0) {
    result = await db.$queryRawUnsafe<ResultItem[]>(
      getChartSql({
        ...payload,
        breakdowns: [],
      })
    );
  }

  // group by sql label
  const series = result.reduce(
    (acc, item) => {
      // item.label can be null when using breakdowns on a property
      // that doesn't exist on all events
      const label = item.label?.trim() ?? payload.event.id;
      if (label) {
        if (acc[label]) {
          acc[label]?.push(item);
        } else {
          acc[label] = [item];
        }
      }

      return {
        ...acc,
      };
    },
    {} as Record<string, ResultItem[]>
  );

  return Object.keys(series).map((key) => {
    const legend = payload.breakdowns.length
      ? key
      : getEventLegend(payload.event);
    const data = series[key] ?? [];

    return {
      name: legend,
      event: {
        id: payload.event.id,
        name: payload.event.name,
      },
      metrics: {
        total: sum(data.map((item) => item.count)),
        average: round(average(data.map((item) => item.count))),
      },
      data:
        payload.chartType === 'linear' || payload.chartType === 'histogram'
          ? fillEmptySpotsInTimeline(
              data,
              payload.interval,
              payload.startDate,
              payload.endDate
            ).map((item) => {
              return {
                label: legend,
                count: round(item.count),
                date: new Date(item.date).toISOString(),
              };
            })
          : [],
    };
  });
}

function fillEmptySpotsInTimeline(
  items: ResultItem[],
  interval: IInterval,
  startDate: string,
  endDate: string
) {
  const result = [];
  const clonedStartDate = new Date(startDate);
  const clonedEndDate = new Date(endDate);
  const today = new Date();

  if (interval === 'minute') {
    clonedStartDate.setUTCSeconds(0, 0);
    clonedEndDate.setUTCMinutes(clonedEndDate.getUTCMinutes() + 1, 0, 0);
  } else if (interval === 'hour') {
    clonedStartDate.setUTCMinutes(0, 0, 0);
    clonedEndDate.setUTCMinutes(0, 0, 0);
  } else {
    clonedStartDate.setUTCHours(0, 0, 0, 0);
    clonedEndDate.setUTCHours(0, 0, 0, 0);
  }

  if (interval === 'month') {
    clonedStartDate.setUTCDate(1);
    clonedEndDate.setUTCDate(1);
  }

  // Force if interval is month and the start date is the same month as today
  const shouldForce = () =>
    interval === 'month' &&
    clonedStartDate.getUTCFullYear() === today.getUTCFullYear() &&
    clonedStartDate.getUTCMonth() === today.getUTCMonth();
  let prev = undefined;
  while (
    shouldForce() ||
    clonedStartDate.getTime() <= clonedEndDate.getTime()
  ) {
    if (prev === clonedStartDate.getTime()) {
      console.log('GET OUT NOW!');
      break;
    }
    prev = clonedStartDate.getTime();

    const getYear = (date: Date) => date.getUTCFullYear();
    const getMonth = (date: Date) => date.getUTCMonth();
    const getDay = (date: Date) => date.getUTCDate();
    const getHour = (date: Date) => date.getUTCHours();
    const getMinute = (date: Date) => date.getUTCMinutes();

    const item = items.find((item) => {
      const date = new Date(item.date);

      if (interval === 'month') {
        return (
          getYear(date) === getYear(clonedStartDate) &&
          getMonth(date) === getMonth(clonedStartDate)
        );
      }
      if (interval === 'day') {
        return (
          getYear(date) === getYear(clonedStartDate) &&
          getMonth(date) === getMonth(clonedStartDate) &&
          getDay(date) === getDay(clonedStartDate)
        );
      }
      if (interval === 'hour') {
        return (
          getYear(date) === getYear(clonedStartDate) &&
          getMonth(date) === getMonth(clonedStartDate) &&
          getDay(date) === getDay(clonedStartDate) &&
          getHour(date) === getHour(clonedStartDate)
        );
      }
      if (interval === 'minute') {
        return (
          getYear(date) === getYear(clonedStartDate) &&
          getMonth(date) === getMonth(clonedStartDate) &&
          getDay(date) === getDay(clonedStartDate) &&
          getHour(date) === getHour(clonedStartDate) &&
          getMinute(date) === getMinute(clonedStartDate)
        );
      }
    });

    if (item) {
      result.push({
        ...item,
        date: clonedStartDate.toISOString(),
      });
    } else {
      result.push({
        date: clonedStartDate.toISOString(),
        count: 0,
        label: null,
      });
    }

    switch (interval) {
      case 'day': {
        clonedStartDate.setUTCDate(clonedStartDate.getUTCDate() + 1);
        break;
      }
      case 'hour': {
        clonedStartDate.setUTCHours(clonedStartDate.getUTCHours() + 1);
        break;
      }
      case 'minute': {
        clonedStartDate.setUTCMinutes(clonedStartDate.getUTCMinutes() + 1);
        break;
      }
      case 'month': {
        clonedStartDate.setUTCMonth(clonedStartDate.getUTCMonth() + 1);
        break;
      }
    }
  }

  return sort(function (a, b) {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  }, result);
}
