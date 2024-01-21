import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import * as cache from '@/server/cache';
import { getChartSql } from '@/server/chart-sql/getChartSql';
import { isJsonPath, selectJsonPath } from '@/server/chart-sql/helpers';
import { db } from '@/server/db';
import { getUniqueEvents } from '@/server/services/event.service';
import type {
  IChartEvent,
  IChartRange,
  IGetChartDataInput,
  IInterval,
} from '@/types';
import { alphabetIds } from '@/utils/constants';
import { getDaysOldDate } from '@/utils/date';
import { average, round, sum } from '@/utils/math';
import { toDots } from '@/utils/object';
import { zChartInputWithDates } from '@/utils/validation';
import { pipe, sort, uniq } from 'ramda';
import { z } from 'zod';

export const chartRouter = createTRPCRouter({
  events: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId } }) => {
      const events = await cache.getOr(
        `events_${projectId}`,
        1000 * 60 * 60 * 24,
        () => getUniqueEvents({ projectId: projectId })
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
      const events = await cache.getOr(
        `events_${projectId}_${event ?? 'all'}`,
        1000 * 60 * 60,
        () =>
          db.event.findMany({
            take: 500,
            where: {
              project_id: projectId,
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
        projectId: z.string(),
      })
    )
    .query(async ({ input: { event, property, projectId } }) => {
      const intervalInDays = 180;
      if (isJsonPath(property)) {
        const events = await db.$queryRawUnsafe<{ value: string }[]>(
          `SELECT ${selectJsonPath(
            property
          )} AS value from events WHERE project_id = '${projectId}' AND name = '${event}' AND "createdAt" >= NOW() - INTERVAL '${intervalInDays} days'`
        );

        return {
          values: uniq(events.map((item) => item.value)),
        };
      } else {
        const events = await db.event.findMany({
          where: {
            project_id: projectId,
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
    .input(zChartInputWithDates.merge(z.object({ projectId: z.string() })))
    .query(async ({ input }) => {
      const current = getDatesFromRange(input.range);
      let diff = 0;

      switch (input.range) {
        case '24h':
        case 'today': {
          diff = 1000 * 60 * 60 * 24;
          break;
        }
        case '7d': {
          diff = 1000 * 60 * 60 * 24 * 17;
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

      const promises = [wrapper(input)];

      if (input.previous) {
        promises.push(
          wrapper({
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

      const awaitedPromises = await Promise.all(promises);
      const data = awaitedPromises[0]!;
      const previousData = awaitedPromises[1];

      return {
        ...data,
        series: data.series.map((item, sIndex) => {
          function getPreviousDiff(key: keyof (typeof data)['metrics']) {
            const prev = previousData?.series?.[sIndex]?.metrics?.[key];
            const diff = getPreviousDataDiff(item.metrics[key], prev);

            return diff && prev
              ? {
                  diff: diff?.diff,
                  state: diff?.state,
                  value: prev,
                }
              : null;
          }

          return {
            ...item,
            metrics: {
              ...item.metrics,
              previous: {
                sum: getPreviousDiff('sum'),
                average: getPreviousDiff('average'),
              },
            },
            data: item.data.map((item, dIndex) => {
              const diff = getPreviousDataDiff(
                item.count,
                previousData?.series?.[sIndex]?.data?.[dIndex]?.count
              );
              return {
                ...item,
                previous:
                  diff && previousData?.series?.[sIndex]?.data?.[dIndex]
                    ? Object.assign(
                        {},
                        previousData?.series?.[sIndex]?.data?.[dIndex],
                        diff
                      )
                    : null,
              };
            }),
          };
        }),
      };
    }),
});

const chartValidator = zChartInputWithDates.merge(
  z.object({ projectId: z.string() })
);
type ChartInput = z.infer<typeof chartValidator>;

function getPreviousDataDiff(current: number, previous: number | undefined) {
  if (!previous) {
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
    diff: Number.isNaN(diff) || !Number.isFinite(diff) ? null : diff,
    state:
      current > previous
        ? 'positive'
        : current < previous
        ? 'negative'
        : 'neutral',
  };
}

async function wrapper({ events, projectId, ...input }: ChartInput) {
  const { startDate, endDate } =
    input.startDate && input.endDate
      ? {
          startDate: input.startDate,
          endDate: input.endDate,
        }
      : getDatesFromRange(input.range);
  const series: Awaited<ReturnType<typeof getChartData>> = [];
  for (const event of events) {
    const result = await getChartData({
      ...input,
      startDate,
      endDate,
      event,
      projectId: projectId,
    });
    series.push(...result);
  }

  const sorted = [...series].sort((a, b) => {
    if (input.chartType === 'linear') {
      const sumA = a.data.reduce((acc, item) => acc + item.count, 0);
      const sumB = b.data.reduce((acc, item) => acc + item.count, 0);
      return sumB - sumA;
    } else {
      return b.metrics.sum - a.metrics.sum;
    }
  });

  const metrics = {
    max: Math.max(...sorted.map((item) => item.metrics.max)),
    min: Math.min(...sorted.map((item) => item.metrics.min)),
    sum: sum(sorted.map((item) => item.metrics.sum, 0)),
    average: round(average(sorted.map((item) => item.metrics.average, 0)), 2),
  };

  return {
    events: Object.entries(
      series.reduce(
        (acc, item) => {
          if (acc[item.event.id]) {
            acc[item.event.id] += item.metrics.sum;
          } else {
            acc[item.event.id] = item.metrics.sum;
          }
          return acc;
        },
        {} as Record<(typeof series)[number]['event']['id'], number>
      )
    ).map(([id, count]) => ({
      count,
      ...events.find((event) => event.id === id)!,
    })),
    series: sorted,
    metrics,
  };
}

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
    // If we have breakdowns, we want to use the breakdown key as the legend
    // But only if it successfully broke it down, otherwise we use the getEventLabel
    const legend =
      payload.breakdowns.length && !alphabetIds.includes(key as 'A')
        ? key
        : getEventLegend(payload.event);
    const data =
      payload.chartType === 'area' ||
      payload.chartType === 'linear' ||
      payload.chartType === 'histogram' ||
      payload.chartType === 'metric' ||
      payload.chartType === 'pie' ||
      payload.chartType === 'bar'
        ? fillEmptySpotsInTimeline(
            series[key] ?? [],
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
        : (series[key] ?? []).map((item) => ({
            label: item.label,
            count: round(item.count),
            date: new Date(item.date).toISOString(),
          }));

    const counts = data.map((item) => item.count);

    return {
      name: legend,
      event: payload.event,
      metrics: {
        sum: sum(counts),
        average: round(average(counts)),
        max: Math.max(...counts),
        min: Math.min(...counts),
      },
      data,
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
