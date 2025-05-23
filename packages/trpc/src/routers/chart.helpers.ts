import * as mathjs from 'mathjs';
import { last, pluck, reverse, uniq } from 'ramda';
import { escape } from 'sqlstring';

import type { ISerieDataItem } from '@openpanel/common';
import {
  DateTime,
  average,
  getPreviousMetric,
  groupByLabels,
  max,
  min,
  round,
  slug,
  sum,
} from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';
import {
  TABLE_NAMES,
  chQuery,
  createSqlBuilder,
  formatClickhouseDate,
  getChartSql,
  getEventFiltersWhereClause,
  getOrganizationSubscriptionChartEndDate,
  getSettingsForProject,
} from '@openpanel/db';
import type {
  FinalChart,
  IChartEvent,
  IChartInput,
  IChartInputWithDates,
  IChartRange,
  IGetChartDataInput,
} from '@openpanel/validation';

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

export function getDatesFromRange(range: IChartRange, timezone: string) {
  if (range === '30min' || range === 'lastHour') {
    const minutes = range === '30min' ? 30 : 60;
    const startDate = DateTime.now()
      .minus({ minute: minutes })
      .startOf('minute')
      .setZone(timezone)
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('minute')
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === 'today') {
    const startDate = DateTime.now()
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === 'yesterday') {
    const startDate = DateTime.now()
      .minus({ day: 1 })
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .minus({ day: 1 })
      .setZone(timezone)
      .endOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === '7d') {
    const startDate = DateTime.now()
      .minus({ day: 7 })
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === '6m') {
    const startDate = DateTime.now()
      .minus({ month: 6 })
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === '12m') {
    const startDate = DateTime.now()
      .minus({ month: 12 })
      .setZone(timezone)
      .startOf('month')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('month')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === 'monthToDate') {
    const startDate = DateTime.now()
      .setZone(timezone)
      .startOf('month')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === 'lastMonth') {
    const month = DateTime.now()
      .minus({ month: 1 })
      .setZone(timezone)
      .startOf('month');

    const startDate = month.toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = month
      .endOf('month')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === 'yearToDate') {
    const startDate = DateTime.now()
      .setZone(timezone)
      .startOf('year')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === 'lastYear') {
    const year = DateTime.now().minus({ year: 1 }).setZone(timezone);
    const startDate = year.startOf('year').toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = year.endOf('year').toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  // range === '30d'
  const startDate = DateTime.now()
    .minus({ day: 30 })
    .setZone(timezone)
    .startOf('day')
    .toFormat('yyyy-MM-dd HH:mm:ss');
  const endDate = DateTime.now()
    .setZone(timezone)
    .endOf('day')
    .plus({ millisecond: 1 })
    .toFormat('yyyy-MM-dd HH:mm:ss');

  return {
    startDate: startDate,
    endDate: endDate,
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

export function getChartStartEndDate(
  {
    startDate,
    endDate,
    range,
  }: Pick<IChartInput, 'endDate' | 'startDate' | 'range'>,
  timezone: string,
) {
  const ranges = getDatesFromRange(range, timezone);

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
}: {
  startDate: string;
  endDate: string;
}) {
  let diff = DateTime.fromFormat(endDate, 'yyyy-MM-dd HH:mm:ss').diff(
    DateTime.fromFormat(startDate, 'yyyy-MM-dd HH:mm:ss'),
  );

  // this will make sure our start and end date's are correct
  // otherwise if a day ends with 23:59:59.999 and starts with 00:00:00.000
  // the diff will be 23:59:59.999 and that will make the start date wrong
  // so we add 1 millisecond to the diff
  if ((diff.milliseconds / 1000) % 2 !== 0) {
    diff = diff.plus({ millisecond: 1 });
  }

  return {
    startDate: DateTime.fromFormat(startDate, 'yyyy-MM-dd HH:mm:ss')
      .minus({ millisecond: diff.milliseconds })
      .toFormat('yyyy-MM-dd HH:mm:ss'),
    endDate: DateTime.fromFormat(endDate, 'yyyy-MM-dd HH:mm:ss')
      .minus({ millisecond: diff.milliseconds })
      .toFormat('yyyy-MM-dd HH:mm:ss'),
  };
}

export async function getFunnelData({
  projectId,
  startDate,
  endDate,
  ...payload
}: IChartInput) {
  const funnelWindow = (payload.funnelWindow || 24) * 3600;
  const funnelGroup =
    payload.funnelGroup === 'profile_id'
      ? [`COALESCE(nullIf(s.profile_id, ''), e.profile_id)`, 'profile_id']
      : ['session_id', 'session_id'];

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

  const commonWhere = `project_id = ${escape(projectId)} AND 
    created_at >= '${formatClickhouseDate(startDate)}' AND 
    created_at <= '${formatClickhouseDate(endDate)}'`;

  const innerSql = `SELECT
    ${funnelGroup[0]} AS ${funnelGroup[1]},
    windowFunnel(${funnelWindow}, 'strict_increase')(toUnixTimestamp(created_at), ${funnels.join(', ')}) AS level
  FROM ${TABLE_NAMES.events} e
  ${funnelGroup[0] === 'session_id' ? '' : `LEFT JOIN (SELECT profile_id, id FROM sessions WHERE ${commonWhere}) AS s ON s.id = e.session_id`}
  WHERE 
    ${commonWhere} AND
    name IN (${payload.events.map((event) => escape(event.name)).join(', ')})
  GROUP BY ${funnelGroup[0]}`;

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

export async function getChartSerie(
  payload: IGetChartDataInput,
  timezone: string,
) {
  async function getSeries() {
    const result = await chQuery<ISerieDataItem>(
      getChartSql({ ...payload, timezone }),
      {
        session_timezone: timezone,
      },
    );

    if (result.length === 0 && payload.breakdowns.length > 0) {
      return await chQuery<ISerieDataItem>(
        getChartSql({
          ...payload,
          breakdowns: [],
          timezone,
        }),
        {
          session_timezone: timezone,
        },
      );
    }
    return result;
  }

  return getSeries()
    .then(groupByLabels)
    .then((series) => {
      return series.map((serie) => {
        return {
          ...serie,
          event: payload.event,
        };
      });
    });
}

export type IGetChartSerie = Awaited<ReturnType<typeof getChartSeries>>[number];
export async function getChartSeries(
  input: IChartInputWithDates,
  timezone: string,
) {
  const series = (
    await Promise.all(
      input.events.map(async (event) =>
        getChartSerie(
          {
            ...input,
            event,
          },
          timezone,
        ),
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
  const { timezone } = await getSettingsForProject(input.projectId);
  const currentPeriod = getChartStartEndDate(input, timezone);
  const previousPeriod = getChartPrevStartEndDate(currentPeriod);

  const endDate = await getOrganizationSubscriptionChartEndDate(
    input.projectId,
    currentPeriod.endDate,
  );

  if (endDate) {
    currentPeriod.endDate = endDate;
  }

  const promises = [getChartSeries({ ...input, ...currentPeriod }, timezone)];

  if (input.previous) {
    promises.push(
      getChartSeries(
        {
          ...input,
          ...previousPeriod,
        },
        timezone,
      ),
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
