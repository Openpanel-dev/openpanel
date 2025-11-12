import * as mathjs from 'mathjs';
import { last, pluck, reverse, uniq } from 'ramda';
import sqlstring from 'sqlstring';

import type { ISerieDataItem } from '@openpanel/common';
import {
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
  getChartPrevStartEndDate,
  getChartSql,
  getChartStartEndDate,
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
    sb.where.name = `name = ${sqlstring.escape(event.name)}`;
    return getWhere().replace('WHERE ', '');
  });

  const commonWhere = `project_id = ${sqlstring.escape(projectId)} AND 
    created_at >= '${formatClickhouseDate(startDate)}' AND 
    created_at <= '${formatClickhouseDate(endDate)}'`;

  const innerSql = `SELECT
    ${funnelGroup[0]} AS ${funnelGroup[1]},
    windowFunnel(${funnelWindow}, 'strict_increase')(toUnixTimestamp(created_at), ${funnels.join(', ')}) AS level
  FROM ${TABLE_NAMES.events} e
  ${funnelGroup[0] === 'session_id' ? '' : `LEFT JOIN (SELECT profile_id, id FROM sessions WHERE ${commonWhere}) AS s ON s.id = e.session_id`}
  WHERE 
    ${commonWhere} AND
    name IN (${payload.events.map((event) => sqlstring.escape(event.name)).join(', ')})
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
  let result = await chQuery<ISerieDataItem>(
    getChartSql({ ...payload, timezone }),
    {
      session_timezone: timezone,
    },
  );

  if (result.length === 0 && payload.breakdowns.length > 0) {
    result = await chQuery<ISerieDataItem>(
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

  return groupByLabels(result).map((serie) => {
    return {
      ...serie,
      event: payload.event,
    };
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
        count: serie.data[0]?.total_count, // We can grab any since all are the same
      };
      const event = {
        id: serie.event.id,
        name: serie.event.displayName || serie.event.name,
      };

      return {
        id: getSerieId(serie),
        names:
          input.breakdowns.length === 0 && serie.event.displayName
            ? [serie.event.displayName]
            : includeEventName
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
                  count: getPreviousMetric(
                    metrics.count ?? 0,
                    previousSerie?.data[0]?.total_count ?? null,
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
      count: undefined,
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
      return (b.metrics[input.metric] ?? 0) - (a.metrics[input.metric] ?? 0);
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
      count: undefined,
    };
  }

  return final;
}
