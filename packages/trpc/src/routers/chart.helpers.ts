import {
  endOfDay,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMinutes,
  subMonths,
  subYears,
} from 'date-fns';
import * as mathjs from 'mathjs';
import { repeat, reverse, sort } from 'ramda';
import { escape } from 'sqlstring';

import { round } from '@openpanel/common';
import { alphabetIds, NOT_SET_VALUE } from '@openpanel/constants';
import {
  chQuery,
  convertClickhouseDateToJs,
  createSqlBuilder,
  formatClickhouseDate,
  getChartSql,
  getEventFiltersWhereClause,
  getProfiles,
} from '@openpanel/db';
import type {
  IChartEvent,
  IChartInput,
  IChartRange,
  IGetChartDataInput,
  IInterval,
} from '@openpanel/validation';

export type GetChartDataResult = Awaited<ReturnType<typeof getChartData>>;
export interface ResultItem {
  label: string | null;
  count: number | null;
  date: string;
}

function getEventLegend(event: IChartEvent) {
  return event.displayName ?? `${event.name} (${event.id})`;
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
      break;
    }
    prev = clonedStartDate.getTime();

    const getYear = (date: Date) => date.getUTCFullYear();
    const getMonth = (date: Date) => date.getUTCMonth();
    const getDay = (date: Date) => date.getUTCDate();
    const getHour = (date: Date) => date.getUTCHours();
    const getMinute = (date: Date) => date.getUTCMinutes();

    const item = items.find((item) => {
      const date = convertClickhouseDateToJs(item.date);

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

      return false;
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

export function withFormula(
  { formula, events }: IChartInput,
  series: GetChartDataResult
) {
  if (!formula) {
    return series;
  }

  if (!series) {
    return series;
  }

  if (!series[0]) {
    return series;
  }
  if (!series[0].data) {
    return series;
  }

  if (events.length === 1) {
    return series.map((serie) => {
      return {
        ...serie,
        data: serie.data.map((item) => {
          serie.event.id;
          const scope = {
            [serie.event.id]: item?.count ?? 0,
          };
          const count = mathjs
            .parse(formula)
            .compile()
            .evaluate(scope) as number;

          return {
            ...item,
            count:
              Number.isNaN(count) || !Number.isFinite(count)
                ? null
                : round(count, 2),
          };
        }),
      };
    });
  }

  return [
    {
      ...series[0],
      data: series[0].data.map((item, dIndex) => {
        const scope = series.reduce((acc, item) => {
          return {
            ...acc,
            [item.event.id]: item.data[dIndex]?.count ?? 0,
          };
        }, {});

        const count = mathjs.parse(formula).compile().evaluate(scope) as number;
        return {
          ...item,
          count:
            Number.isNaN(count) || !Number.isFinite(count)
              ? null
              : round(count, 2),
        };
      }),
    },
  ];
}

export async function getChartData(payload: IGetChartDataInput) {
  let result = await chQuery<ResultItem>(getChartSql(payload));

  if (result.length === 0 && payload.breakdowns.length > 0) {
    result = await chQuery<ResultItem>(
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
      const label = item.label?.trim() || NOT_SET_VALUE;
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
    const isBreakdown =
      payload.breakdowns.length && !alphabetIds.includes(key as 'A');
    const serieName = isBreakdown ? key : getEventLegend(payload.event);
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
              label: serieName,
              count: item.count ? round(item.count) : null,
              date: new Date(item.date).toISOString(),
            };
          })
        : (series[key] ?? []).map((item) => ({
            label: item.label,
            count: item.count ? round(item.count) : null,
            date: new Date(item.date).toISOString(),
          }));

    return {
      name: serieName,
      event: payload.event,
      data,
    };
  });
}

export function getDatesFromRange(range: IChartRange) {
  if (range === '30min' || range === 'lastHour') {
    const minutes = range === '30min' ? 30 : 60;
    const startDate = subMinutes(new Date(), minutes).toUTCString();
    const endDate = new Date().toUTCString();

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'today') {
    const startDate = startOfDay(new Date());
    const endDate = endOfDay(new Date());

    return {
      startDate: startDate.toUTCString(),
      endDate: endDate.toUTCString(),
    };
  }

  if (range === '7d') {
    const startDate = subDays(new Date(), 7).toUTCString();
    const endDate = new Date().toUTCString();

    return {
      startDate,
      endDate,
    };
  }

  if (range === '30d') {
    const startDate = subDays(new Date(), 30).toUTCString();
    const endDate = new Date().toUTCString();

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'monthToDate') {
    const startDate = startOfMonth(new Date()).toUTCString();
    const endDate = new Date().toUTCString();

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'lastMonth') {
    const month = subMonths(new Date(), 1);
    const startDate = startOfMonth(month).toUTCString();
    const endDate = endOfDay(month).toUTCString();

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'yearToDate') {
    const startDate = startOfYear(new Date()).toUTCString();
    const endDate = new Date().toUTCString();

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'lastYear') {
    const year = subYears(new Date(), 1);
    const startDate = startOfYear(year).toUTCString();
    const endDate = endOfYear(year).toUTCString();

    return {
      startDate,
      endDate,
    };
  }

  console.log('-------------------------------');
  console.log('-------------------------------');
  console.log('-------------------------------');
  console.log('-------------------------------');
  console.log('-------------------------------');
  console.log('-------------------------------');
  console.log('-------------------------------');
  console.log('-------------------------------');
  console.log('-------------------------------');
  console.log('-------------------------------');
  console.log('-------------------------------');
  return {
    startDate: subDays(new Date(), 30).toISOString(),
    endDate: new Date().toISOString(),
  };
}

export function getChartStartEndDate({
  startDate,
  endDate,
  range,
}: Pick<IChartInput, 'endDate' | 'startDate' | 'range'>) {
  return startDate && endDate
    ? { startDate: startDate, endDate: endDate }
    : getDatesFromRange(range);
}

export function getChartPrevStartEndDate({
  startDate,
  endDate,
  range,
}: {
  startDate: string;
  endDate: string;
  range: IChartRange;
}) {
  const diff = new Date(endDate).getTime() - new Date(startDate).getTime();
  return {
    startDate: new Date(new Date(startDate).getTime() - diff).toISOString(),
    endDate: new Date(new Date(endDate).getTime() - diff).toISOString(),
  };
}

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

export async function getFunnelData({
  projectId,
  startDate,
  endDate,
  ...payload
}: IChartInput) {
  if (!startDate || !endDate) {
    throw new Error('startDate and endDate are required');
  }

  if (payload.events.length === 0) {
    return {
      totalSessions: 0,
      steps: [],
    };
  }

  const funnels = payload.events.map((event) => {
    const { sb, getWhere } = createSqlBuilder();
    sb.where = getEventFiltersWhereClause(event.filters);
    sb.where.name = `name = ${escape(event.name)}`;
    return getWhere().replace('WHERE ', '');
  });

  const innerSql = `SELECT
    session_id,
    windowFunnel(${ONE_DAY_IN_SECONDS})(toUnixTimestamp(created_at), ${funnels.join(', ')}) AS level
  FROM events
  WHERE 
    project_id = ${escape(projectId)} AND 
    created_at >= '${formatClickhouseDate(startDate)}' AND 
    created_at <= '${formatClickhouseDate(endDate)}' AND
    name IN (${payload.events.map((event) => escape(event.name)).join(', ')})
  GROUP BY session_id`;

  const sql = `SELECT level, count() AS count FROM (${innerSql}) GROUP BY level ORDER BY level DESC`;

  const [funnelRes, sessionRes] = await Promise.all([
    chQuery<{ level: number; count: number }>(sql),
    chQuery<{ count: number }>(
      `SELECT count(name) as count FROM events WHERE project_id = ${escape(projectId)} AND name = 'session_start' AND (created_at >= '${formatClickhouseDate(startDate)}') AND (created_at <= '${formatClickhouseDate(endDate)}')`
    ),
  ]);

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
        const event = payload.events[item.level - 1]!;
        return [
          ...acc,
          {
            event: {
              ...event,
              displayName: event.displayName ?? event.name,
            },
            count: item.count,
            percent: (item.count / totalSessions) * 100,
            dropoffCount: prev.count - item.count,
            dropoffPercent: 100 - (item.count / prev.count) * 100,
            previousCount: prev.count,
          },
        ];
      },
      [] as {
        event: IChartEvent & { displayName: string };
        count: number;
        percent: number;
        dropoffCount: number;
        dropoffPercent: number;
        previousCount: number;
      }[]
    );

  return {
    totalSessions,
    steps,
  };
}

export async function getFunnelStep({
  projectId,
  startDate,
  endDate,
  step,
  ...payload
}: IChartInput & {
  step: number;
}) {
  if (!startDate || !endDate) {
    throw new Error('startDate and endDate are required');
  }

  if (payload.events.length === 0) {
    throw new Error('no events selected');
  }

  const funnels = payload.events.map((event) => {
    const { sb, getWhere } = createSqlBuilder();
    sb.where = getEventFiltersWhereClause(event.filters);
    sb.where.name = `name = ${escape(event.name)}`;
    return getWhere().replace('WHERE ', '');
  });

  const innerSql = `SELECT
    session_id,
    windowFunnel(${ONE_DAY_IN_SECONDS})(toUnixTimestamp(created_at), ${funnels.join(', ')}) AS level
  FROM events
  WHERE 
    project_id = ${escape(projectId)} AND 
    created_at >= '${formatClickhouseDate(startDate)}' AND 
    created_at <= '${formatClickhouseDate(endDate)}' AND
    name IN (${payload.events.map((event) => escape(event.name)).join(', ')})
  GROUP BY session_id`;

  const profileIdsQuery = `WITH sessions AS (${innerSql}) 
    SELECT 
      DISTINCT e.profile_id as id
    FROM sessions s
    JOIN events e ON s.session_id = e.session_id
    WHERE 
      s.level = ${step} AND
      e.project_id = ${escape(projectId)} AND 
      e.created_at >= '${formatClickhouseDate(startDate)}' AND 
      e.created_at <= '${formatClickhouseDate(endDate)}' AND
      name IN (${payload.events.map((event) => escape(event.name)).join(', ')})
    ORDER BY e.created_at DESC
    LIMIT 500
    `;

  const res = await chQuery<{
    id: string;
  }>(profileIdsQuery);

  return getProfiles({ ids: res.map((r) => r.id) });
}

export async function getSeriesFromEvents(input: IChartInput) {
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
