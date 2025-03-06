import {
  differenceInMilliseconds,
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
import { last, pluck, repeat, reverse, uniq } from 'ramda';
import { escape } from 'sqlstring';

import {
  average,
  completeSerie,
  getPreviousMetric,
  max,
  min,
  round,
  slug,
  sum,
} from '@openpanel/common';
import type { ISerieDataItem } from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';
import {
  TABLE_NAMES,
  chQuery,
  createSqlBuilder,
  db,
  formatClickhouseDate,
  getChartSql,
  getEventFiltersWhereClause,
  getOrganizationByProjectId,
  getOrganizationByProjectIdCached,
  getProfiles,
} from '@openpanel/db';
import type {
  FinalChart,
  IChartEvent,
  IChartInput,
  IChartInputWithDates,
  IChartRange,
  IGetChartDataInput,
  IInterval,
} from '@openpanel/validation';
import { TRPCNotFoundError } from '../errors';

function getEventLegend(event: IChartEvent) {
  return event.displayName || event.name;
}

export function withFormula(
  { formula, events }: IChartInput,
  series: Awaited<ReturnType<typeof getChartSerie>>,
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
      if (!serie.event.id) {
        return serie;
      }

      return {
        ...serie,
        data: serie.data.map((item) => {
          serie.event.id;
          const scope = {
            [serie.event.id ?? '']: item?.count ?? 0,
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
        const scope = series.reduce((acc, item, index) => {
          const readableId = alphabetIds[index];

          if (!readableId) {
            throw new Error('no alphabet id for serie in withFormula');
          }

          return {
            ...acc,
            [readableId]: item.data[dIndex]?.count ?? 0,
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
  interval: IInterval,
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
    const startDate = formatISO(startOfDay(subDays(new Date(), 7)));
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

  // range === '30d'
  const startDate = formatISO(startOfDay(subDays(new Date(), 30)));
  const endDate = formatISO(new Date());

  return {
    startDate,
    endDate,
  };
}

function fillFunnel(funnel: { level: number; count: number }[], steps: number) {
  const filled = Array.from({ length: steps }, (_, index) => {
    const level = index + 1;
    const matchingResult = funnel.find((res) => res.level === level);
    return {
      level,
      count: matchingResult ? matchingResult.count : 0,
    };
  });

  // Accumulate counts from top to bottom of the funnel
  for (let i = filled.length - 1; i >= 0; i--) {
    const step = filled[i];
    const prevStep = filled[i + 1];
    // If there's a previous step, add the count to the current step
    if (step && prevStep) {
      step.count += prevStep.count;
    }
  }
  return filled.reverse();
}

export function getChartStartEndDate({
  startDate,
  endDate,
  range,
}: Pick<IChartInput, 'endDate' | 'startDate' | 'range'>) {
  const ranges = getDatesFromRange(range);

  if (startDate && endDate) {
    return { startDate: startDate, endDate: endDate };
  }

  if (!startDate && endDate) {
    return { startDate: ranges.startDate, endDate: endDate };
  }

  return ranges;
}

export function getChartPrevStartEndDate({
  startDate,
  endDate,
  // range,
}: {
  startDate: string;
  endDate: string;
  // range: IChartRange;
}) {
  const diff = differenceInMilliseconds(new Date(endDate), new Date(startDate));
  return {
    startDate: formatISO(subMilliseconds(new Date(startDate), diff + 1000)),
    endDate: formatISO(subMilliseconds(new Date(endDate), diff + 1000)),
  };
}

export async function getFunnelData({
  projectId,
  startDate,
  endDate,
  ...payload
}: IChartInput) {
  const funnelWindow = (payload.funnelWindow || 24) * 3600;
  const funnelGroup = payload.funnelGroup || 'session_id';

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
    ${
      payload.funnelGroup === 'session_id'
        ? 'session_id'
        : 's.profile_id as profile_id'
    },
    windowFunnel(${funnelWindow}, 'strict_increase')(toUnixTimestamp(created_at), ${funnels.join(', ')}) AS level
  FROM ${TABLE_NAMES.events} e
  ${payload.funnelGroup === 'profile_id' ? 'JOIN sessions s ON e.session_id = s.id' : ''}
  WHERE 
    project_id = ${escape(projectId)} AND 
    created_at >= '${formatClickhouseDate(startDate)}' AND 
    created_at <= '${formatClickhouseDate(endDate)}' AND
    name IN (${payload.events.map((event) => escape(event.name)).join(', ')})
  GROUP BY ${funnelGroup}`;

  const sql = `SELECT level, count() AS count FROM (${innerSql}) WHERE level != 0 GROUP BY level ORDER BY level DESC`;

  const funnel = await chQuery<{ level: number; count: number }>(sql);
  const maxLevel = payload.events.length;
  const filledFunnelRes = fillFunnel(funnel, maxLevel);

  const totalSessions = last(filledFunnelRes)?.count ?? 0;
  const steps = reverse(filledFunnelRes).reduce(
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
    }[],
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
  throw new Error('not implemented');
  // if (!startDate || !endDate) {
  //   throw new Error('startDate and endDate are required');
  // }

  // if (payload.events.length === 0) {
  //   throw new Error('no events selected');
  // }

  // const funnels = payload.events.map((event) => {
  //   const { sb, getWhere } = createSqlBuilder();
  //   sb.where = getEventFiltersWhereClause(event.filters);
  //   sb.where.name = `name = ${escape(event.name)}`;
  //   return getWhere().replace('WHERE ', '');
  // });

  // const innerSql = `SELECT
  //   session_id,
  //   windowFunnel(${ONE_DAY_IN_SECONDS})(toUnixTimestamp(created_at), ${funnels.join(', ')}) AS level
  // FROM ${TABLE_NAMES.events}
  // WHERE
  //   project_id = ${escape(projectId)} AND
  //   created_at >= '${formatClickhouseDate(startDate)}' AND
  //   created_at <= '${formatClickhouseDate(endDate)}' AND
  //   name IN (${payload.events.map((event) => escape(event.name)).join(', ')})
  // GROUP BY session_id`;

  // const profileIdsQuery = `WITH sessions AS (${innerSql})
  //   SELECT
  //     DISTINCT e.profile_id as id
  //   FROM sessions s
  //   JOIN ${TABLE_NAMES.events} e ON s.session_id = e.session_id
  //   WHERE
  //     s.level = ${step} AND
  //     e.project_id = ${escape(projectId)} AND
  //     e.created_at >= '${formatClickhouseDate(startDate)}' AND
  //     e.created_at <= '${formatClickhouseDate(endDate)}' AND
  //     name IN (${payload.events.map((event) => escape(event.name)).join(', ')})
  //   ORDER BY e.created_at DESC
  //   LIMIT 500
  //   `;

  // const res = await chQuery<{
  //   id: string;
  // }>(profileIdsQuery);

  // return getProfiles(
  //   res.map((r) => r.id),
  //   projectId,
  // );
}

export async function getChartSerie(payload: IGetChartDataInput) {
  async function getSeries() {
    const result = await chQuery<ISerieDataItem>(getChartSql(payload));
    if (result.length === 0 && payload.breakdowns.length > 0) {
      return await chQuery<ISerieDataItem>(
        getChartSql({
          ...payload,
          breakdowns: [],
        }),
      );
    }
    return result;
  }

  return getSeries()
    .then((data) =>
      completeSerie(data, payload.startDate, payload.endDate, payload.interval),
    )
    .then((series) => {
      return Object.keys(series).map((key) => {
        const firstDataItem = series[key]![0]!;
        const isBreakdown =
          payload.breakdowns.length && firstDataItem.labels.length;
        const serieLabel = isBreakdown
          ? firstDataItem.labels
          : [getEventLegend(payload.event)];
        return {
          name: serieLabel,
          event: payload.event,
          data: series[key]!.map((item) => ({
            ...item,
            date: toDynamicISODateWithTZ(
              item.date,
              payload.startDate,
              payload.interval,
            ),
          })),
        };
      });
    });
}

export type IGetChartSerie = Awaited<ReturnType<typeof getChartSeries>>[number];
export async function getChartSeries(input: IChartInputWithDates) {
  const series = (
    await Promise.all(
      input.events.map(async (event) =>
        getChartSerie({
          ...input,
          event,
        }),
      ),
    )
  ).flat();

  try {
    return withFormula(input, series);
  } catch (e) {
    return series;
  }
}

export async function getChart(input: IChartInput) {
  const organization = await getOrganizationByProjectIdCached(input.projectId);

  if (!organization) {
    throw TRPCNotFoundError(
      `Organization not found by project id ${input.projectId} in getChart`,
    );
  }

  const currentPeriod = getChartStartEndDate(input);
  const previousPeriod = getChartPrevStartEndDate({
    range: input.range,
    ...currentPeriod,
  });

  // If the current period end date is after the subscription chart end date, we need to use the subscription chart end date
  if (
    organization.subscriptionChartEndDate &&
    new Date(currentPeriod.endDate) > organization.subscriptionChartEndDate
  ) {
    currentPeriod.endDate = organization.subscriptionChartEndDate.toISOString();
  }

  const promises = [getChartSeries({ ...input, ...currentPeriod })];

  if (input.previous) {
    promises.push(
      getChartSeries({
        ...input,
        ...previousPeriod,
      }),
    );
  }

  const getSerieId = (serie: IGetChartSerie) =>
    [slug(serie.name.join('-')), serie.event.id].filter(Boolean).join('-');
  const result = await Promise.all(promises);
  const series = result[0]!;
  const previousSeries = result[1];
  const limit = input.limit || 300;
  const offset = input.offset || 0;
  const includeEventName =
    uniq(pluck('name', input.events)).length !==
      pluck('name', input.events).length && series.length > 1;
  const final: FinalChart = {
    series: series.map((serie, index) => {
      const eventIndex = input.events.findIndex(
        (event) => event.id === serie.event.id,
      );
      const alphaId = alphabetIds[eventIndex];
      const previousSerie = previousSeries?.find(
        (prevSerie) => getSerieId(prevSerie) === getSerieId(serie),
      );
      const metrics = {
        sum: sum(serie.data.map((item) => item.count)),
        average: round(average(serie.data.map((item) => item.count)), 2),
        min: min(serie.data.map((item) => item.count)),
        max: max(serie.data.map((item) => item.count)),
      };
      const event = {
        id: serie.event.id,
        name: serie.event.displayName || serie.event.name,
      };

      return {
        id: getSerieId(serie),
        names: includeEventName
          ? [`(${alphaId}) ${serie.name[0]}`, ...serie.name.slice(1)]
          : serie.name,
        event,
        metrics: {
          ...metrics,
          ...(input.previous
            ? {
                previous: {
                  sum: getPreviousMetric(
                    metrics.sum,
                    previousSerie
                      ? sum(previousSerie?.data.map((item) => item.count))
                      : null,
                  ),
                  average: getPreviousMetric(
                    metrics.average,
                    previousSerie
                      ? round(
                          average(
                            previousSerie?.data.map((item) => item.count),
                          ),
                          2,
                        )
                      : null,
                  ),
                  min: getPreviousMetric(
                    metrics.sum,
                    previousSerie
                      ? min(previousSerie?.data.map((item) => item.count))
                      : null,
                  ),
                  max: getPreviousMetric(
                    metrics.sum,
                    previousSerie
                      ? max(previousSerie?.data.map((item) => item.count))
                      : null,
                  ),
                },
              }
            : {}),
        },
        data: serie.data.map((item, index) => ({
          date: item.date,
          count: item.count ?? 0,
          previous: previousSerie?.data[index]
            ? getPreviousMetric(
                item.count ?? 0,
                previousSerie?.data[index]?.count ?? null,
              )
            : undefined,
        })),
      };
    }),
    metrics: {
      sum: 0,
      average: 0,
      min: 0,
      max: 0,
    },
  };

  // Sort by sum
  final.series = final.series
    .sort((a, b) => {
      if (input.chartType === 'linear') {
        const sumA = a.data.reduce((acc, item) => acc + (item.count ?? 0), 0);
        const sumB = b.data.reduce((acc, item) => acc + (item.count ?? 0), 0);
        return sumB - sumA;
      }
      return b.metrics[input.metric] - a.metrics[input.metric];
    })
    .slice(offset, limit ? offset + limit : series.length);

  final.metrics.sum = sum(final.series.map((item) => item.metrics.sum));
  final.metrics.average = round(
    average(final.series.map((item) => item.metrics.average)),
    2,
  );
  final.metrics.min = min(final.series.map((item) => item.metrics.min));
  final.metrics.max = max(final.series.map((item) => item.metrics.max));
  if (input.previous) {
    final.metrics.previous = {
      sum: getPreviousMetric(
        final.metrics.sum,
        sum(final.series.map((item) => item.metrics.previous?.sum?.value ?? 0)),
      ),
      average: getPreviousMetric(
        final.metrics.average,
        round(
          average(
            final.series.map(
              (item) => item.metrics.previous?.average?.value ?? 0,
            ),
          ),
          2,
        ),
      ),
      min: getPreviousMetric(
        final.metrics.min,
        min(final.series.map((item) => item.metrics.previous?.min?.value ?? 0)),
      ),
      max: getPreviousMetric(
        final.metrics.max,
        max(final.series.map((item) => item.metrics.previous?.max?.value ?? 0)),
      ),
    };
  }

  return final;
}
