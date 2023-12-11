import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import * as cache from '@/server/cache';
import { db } from '@/server/db';
import { getProjectBySlug } from '@/server/services/project.service';
import type {
  IChartEvent,
  IChartInputWithDates,
  IChartRange,
  IInterval,
} from '@/types';
import { getDaysOldDate } from '@/utils/date';
import { toDots } from '@/utils/object';
import { zChartInputWithDates } from '@/utils/validation';
import { last, pipe, sort, uniq } from 'ramda';
import { z } from 'zod';

export const config = {
  api: {
    responseLimit: false,
  },
};

export const chartRouter = createTRPCRouter({
  events: protectedProcedure
    .input(z.object({ projectSlug: z.string() }))
    .query(async ({ input: { projectSlug } }) => {
      const project = await getProjectBySlug(projectSlug);
      const events = await cache.getOr(
        `events_${project.id}`,
        1000 * 60 * 60,
        () =>
          db.event.findMany({
            take: 500,
            distinct: ['name'],
            where: {
              project_id: project.id,
            },
          })
      );

      return events;
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
      const project = await getProjectBySlug(projectSlug);
      const series: Awaited<ReturnType<typeof getChartData>> = [];
      for (const event of events) {
        series.push(
          ...(await getChartData({
            ...input,
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
          return b.totalCount - a.totalCount;
        }
      });

      const meta = {
        highest: sorted[0]?.totalCount ?? 0,
        lowest: last(sorted)?.totalCount ?? 0,
      };

      return {
        events: Object.entries(
          series.reduce(
            (acc, item) => {
              if (acc[item.event.id]) {
                acc[item.event.id] += item.totalCount;
              } else {
                acc[item.event.id] = item.totalCount;
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

function selectJsonPath(property: string) {
  const jsonPath = property
    .replace(/^properties\./, '')
    .replace(/\.\*\./g, '.**.');
  return `jsonb_path_query(properties, '$.${jsonPath}')`;
}

function isJsonPath(property: string) {
  return property.startsWith('properties');
}

interface ResultItem {
  label: string | null;
  count: number;
  date: string;
}

function propertyNameToSql(name: string) {
  if (name.includes('.')) {
    const str = name
      .split('.')
      .map((item, index) => (index === 0 ? item : `'${item}'`))
      .join('->');
    const findLastOf = '->';
    const lastArrow = str.lastIndexOf(findLastOf);
    if (lastArrow === -1) {
      return str;
    }
    const first = str.slice(0, lastArrow);
    const last = str.slice(lastArrow + findLastOf.length);
    return `${first}->>${last}`;
  }

  return name;
}

function getEventLegend(event: IChartEvent) {
  return `${event.name} (${event.id})`;
}

function getTotalCount(arr: ResultItem[]) {
  return arr.reduce((acc, item) => acc + item.count, 0);
}

function isFloat(n: number) {
  return n % 1 !== 0;
}

function getDatesFromRange(range: IChartRange) {
  if (range === 0) {
    const startDate = new Date();
    const endDate = new Date().toISOString();
    startDate.setHours(0, 0, 0, 0);

    return {
      startDate: startDate.toISOString(),
      endDate: endDate,
    };
  }

  if (isFloat(range)) {
    const startDate = new Date(Date.now() - 1000 * 60 * (range * 100));
    const endDate = new Date().toISOString();

    return {
      startDate: startDate.toISOString(),
      endDate: endDate,
    };
  }

  const startDate = getDaysOldDate(range).toISOString();
  const endDate = new Date().toISOString();
  return {
    startDate,
    endDate,
  };
}

function getChartSql({
  event,
  chartType,
  breakdowns,
  interval,
  startDate,
  endDate,
  projectId,
}: Omit<IGetChartDataInput, 'range'> & {
  projectId: string;
}) {
  const select = [];
  const where = [`project_id = '${projectId}'`];
  const groupBy = [];
  const orderBy = [];

  if (event.segment === 'event') {
    select.push(`count(*)::int as count`);
  } else {
    select.push(`count(DISTINCT profile_id)::int as count`);
  }

  switch (chartType) {
    case 'bar': {
      orderBy.push('count DESC');
      break;
    }
    case 'linear': {
      select.push(`date_trunc('${interval}', "createdAt") as date`);
      groupBy.push('date');
      orderBy.push('date');
      break;
    }
  }

  if (event) {
    const { name, filters } = event;
    where.push(`name = '${name}'`);
    if (filters.length > 0) {
      filters.forEach((filter) => {
        const { name, value, operator } = filter;
        switch (operator) {
          case 'contains': {
            if (name.includes('.*.') || name.endsWith('[*]')) {
              // TODO: Make sure this works
              // where.push(
              //   `properties @? '$.${name
              //     .replace(/^properties\./, '')
              //     .replace(/\.\*\./g, '[*].')} ? (@ like_regex "${value[0]}")'`
              // );
            } else {
              where.push(
                `(${value
                  .map(
                    (val) =>
                      `${propertyNameToSql(name)} like '%${String(val).replace(
                        /'/g,
                        "''"
                      )}%'`
                  )
                  .join(' OR ')})`
              );
            }
            break;
          }
          case 'is': {
            if (name.includes('.*.') || name.endsWith('[*]')) {
              where.push(
                `properties @? '$.${name
                  .replace(/^properties\./, '')
                  .replace(/\.\*\./g, '[*].')} ? (${value
                  .map((val) => `@ == "${val}"`)
                  .join(' || ')})'`
              );
            } else {
              where.push(
                `${propertyNameToSql(name)} in (${value
                  .map((val) => `'${val}'`)
                  .join(', ')})`
              );
            }
            break;
          }
          case 'isNot': {
            if (name.includes('.*.') || name.endsWith('[*]')) {
              where.push(
                `properties @? '$.${name
                  .replace(/^properties\./, '')
                  .replace(/\.\*\./g, '[*].')} ? (${value
                  .map((val) => `@ != "${val}"`)
                  .join(' && ')})'`
              );
            } else if (name.includes('.')) {
              where.push(
                `${propertyNameToSql(name)} not in (${value
                  .map((val) => `'${val}'`)
                  .join(', ')})`
              );
            }
            break;
          }
        }
      });
    }
  }

  if (breakdowns.length) {
    const breakdown = breakdowns[0];
    if (breakdown) {
      if (isJsonPath(breakdown.name)) {
        select.push(`${selectJsonPath(breakdown.name)} as label`);
      } else {
        select.push(`${breakdown.name} as label`);
      }
      groupBy.push(`label`);
    }
  } else {
    if (event.name) {
      select.push(`'${event.name}' as label`);
    }
  }

  if (startDate) {
    where.push(`"createdAt" >= '${startDate}'`);
  }

  if (endDate) {
    where.push(`"createdAt" <= '${endDate}'`);
  }

  const sql = [
    `SELECT ${select.join(', ')}`,
    `FROM events`,
    `WHERE ${where.join(' AND ')}`,
  ];

  if (groupBy.length) {
    sql.push(`GROUP BY ${groupBy.join(', ')}`);
  }
  if (orderBy.length) {
    sql.push(`ORDER BY ${orderBy.join(', ')}`);
  }

  return sql.join('\n');
}

type IGetChartDataInput = {
  event: IChartEvent;
} & Omit<IChartInputWithDates, 'events' | 'name'>;

async function getChartData({
  chartType,
  event,
  breakdowns,
  interval,
  range,
  startDate: _startDate,
  endDate: _endDate,
  projectId,
}: IGetChartDataInput & {
  projectId: string;
}) {
  const { startDate, endDate } =
    _startDate && _endDate
      ? {
          startDate: _startDate,
          endDate: _endDate,
        }
      : getDatesFromRange(range);

  const sql = getChartSql({
    chartType,
    event,
    breakdowns,
    interval,
    startDate,
    endDate,
    projectId,
  });

  let result = await db.$queryRawUnsafe<ResultItem[]>(sql);

  if (result.length === 0 && breakdowns.length > 0) {
    result = await db.$queryRawUnsafe<ResultItem[]>(
      getChartSql({
        chartType,
        event,
        breakdowns: [],
        interval,
        startDate,
        endDate,
        projectId,
      })
    );
  }

  console.log(sql);

  // group by sql label
  const series = result.reduce(
    (acc, item) => {
      // item.label can be null when using breakdowns on a property
      // that doesn't exist on all events
      const label = item.label?.trim() ?? event.id;
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
    const legend = breakdowns.length ? key : getEventLegend(event);
    const data = series[key] ?? [];

    return {
      name: legend,
      event: {
        id: event.id,
        name: event.name,
      },
      totalCount: getTotalCount(data),
      data:
        chartType === 'linear'
          ? fillEmptySpotsInTimeline(data, interval, startDate, endDate).map(
              (item) => {
                return {
                  label: legend,
                  count: item.count,
                  date: new Date(item.date).toISOString(),
                };
              }
            )
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
    clonedStartDate.setDate(1);
    clonedEndDate.setDate(1);
  }

  // Force if interval is month and the start date is the same month as today
  const shouldForce = () =>
    interval === 'month' &&
    clonedStartDate.getUTCFullYear() === today.getUTCFullYear() &&
    clonedStartDate.getUTCMonth() === today.getUTCMonth();

  while (
    shouldForce() ||
    clonedStartDate.getTime() <= clonedEndDate.getTime()
  ) {
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
        clonedStartDate.setDate(clonedStartDate.getUTCDate() + 1);
        break;
      }
      case 'hour': {
        clonedStartDate.setHours(clonedStartDate.getUTCHours() + 1);
        break;
      }
      case 'minute': {
        clonedStartDate.setMinutes(clonedStartDate.getUTCMinutes() + 1);
        break;
      }
      case 'month': {
        clonedStartDate.setMonth(clonedStartDate.getUTCMonth() + 1);
        break;
      }
    }
  }

  return sort(function (a, b) {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  }, result);
}
