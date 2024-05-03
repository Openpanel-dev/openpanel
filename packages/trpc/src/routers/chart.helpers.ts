import {
  differenceInMilliseconds,
  endOfDay,
  endOfMonth,
  endOfYear,
  formatISO,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMilliseconds,
  subMinutes,
  subMonths,
  subYears,
} from 'date-fns';
import * as mathjs from 'mathjs';
import { repeat, reverse, sort } from 'ramda';
import { escape } from 'sqlstring';

import { completeTimeline, round } from '@openpanel/common';
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

const toDynamicISODateWithTZ = (
  date: string,
  blueprint: string,
  interval: IInterval
) => {
  // If we have a space in the date we know it's a date with time
  if (date.includes(' ')) {
    // If interval is minutes we need to convert the timezone to what timezone is used (either on client or the server)
    // - We use timezone from server if its a predefined range (yearToDate, lastYear, etc.)
    // - We use timezone from client if its a custom range
    if (interval === 'minute' || interval === 'hour') {
      return (
        date.replace(' ', 'T') +
        // Only append timezone if it's not UTC (Z)
        (blueprint.match(/[+-]\d{2}:\d{2}/) ? blueprint.slice(-6) : 'Z')
      );
    }
    // Otherwise we just return without the timezone
    // It will be converted to the correct timezone on the client
    return date.replace(' ', 'T');
  }
  return `${date}T00:00:00Z`;
};

export async function getChartData(payload: IGetChartDataInput) {
  async function getSeries() {
    const result = await chQuery<ResultItem>(getChartSql(payload));
    if (result.length === 0 && payload.breakdowns.length > 0) {
      return await chQuery<ResultItem>(
        getChartSql({
          ...payload,
          breakdowns: [],
        })
      );
    }
    return result;
  }

  return getSeries()
    .then((data) =>
      completeTimeline(
        data.map((item) => {
          const label = item.label?.trim() || NOT_SET_VALUE;

          return {
            ...item,
            count: item.count ? round(item.count) : null,
            label,
          };
        }),
        payload.startDate,
        payload.endDate,
        payload.interval
      )
    )
    .then((series) => {
      return Object.keys(series).map((label) => {
        const isBreakdown =
          payload.breakdowns.length && !alphabetIds.includes(label as 'A');
        const serieLabel = isBreakdown ? label : getEventLegend(payload.event);
        return {
          name: serieLabel,
          event: payload.event,
          data: series[label]!.map((item) => ({
            ...item,
            date: toDynamicISODateWithTZ(
              item.date,
              payload.startDate,
              payload.interval
            ),
          })),
        };
      });
    });
}

export function getDatesFromRange(range: IChartRange) {
  if (range === '30min' || range === 'lastHour') {
    const minutes = range === '30min' ? 30 : 60;
    const startDate = formatISO(subMinutes(new Date(), minutes));
    const endDate = formatISO(new Date());

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'today') {
    // This is last 24 hours instead
    // Makes it easier to handle timezones
    // const startDate = startOfDay(new Date());
    // const endDate = endOfDay(new Date());
    const startDate = subDays(new Date(), 1);
    const endDate = new Date();

    return {
      startDate: formatISO(startDate),
      endDate: formatISO(endDate),
    };
  }

  if (range === '7d') {
    const startDate = formatISO(subDays(new Date(), 7));
    const endDate = formatISO(new Date());

    return {
      startDate,
      endDate,
    };
  }

  if (range === '30d') {
    const startDate = formatISO(subDays(new Date(), 30));
    const endDate = formatISO(new Date());

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'monthToDate') {
    const startDate = formatISO(startOfMonth(new Date()));
    const endDate = formatISO(new Date());

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'lastMonth') {
    const month = subMonths(new Date(), 1);
    const startDate = formatISO(startOfMonth(month));
    const endDate = formatISO(endOfMonth(month));

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'yearToDate') {
    const startDate = formatISO(startOfYear(new Date()));
    const endDate = formatISO(new Date());

    return {
      startDate,
      endDate,
    };
  }

  if (range === 'lastYear') {
    const year = subYears(new Date(), 1);
    const startDate = formatISO(startOfYear(year));
    const endDate = formatISO(endOfYear(year));

    return {
      startDate,
      endDate,
    };
  }

  return {
    startDate: formatISO(subDays(new Date(), 30)),
    endDate: formatISO(new Date()),
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
}: {
  startDate: string;
  endDate: string;
  range: IChartRange;
}) {
  const diff = differenceInMilliseconds(new Date(endDate), new Date(startDate));
  return {
    startDate: formatISO(subMilliseconds(new Date(startDate), diff - 1)),
    endDate: formatISO(subMilliseconds(new Date(endDate), diff - 1)),
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

  try {
    return withFormula(input, series);
  } catch (e) {
    return series;
  }
}
