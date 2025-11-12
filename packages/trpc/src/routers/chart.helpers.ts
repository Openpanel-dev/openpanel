import * as mathjs from 'mathjs';
import { last, reverse } from 'ramda';
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
  IGetChartDataInput,
} from '@openpanel/validation';

export function withFormula(
  { formula, events }: IChartInput,
  series: Awaited<ReturnType<typeof getChartSerie>>,
) {
  if (!formula) {
    return series;
  }

  if (!series || series.length === 0) {
    return series;
  }

  if (!series[0]?.data) {
    return series;
  }

  // Formulas always use alphabet IDs (A, B, C, etc.), not event IDs
  // Group series by breakdown values (the name array)
  // This allows us to match series from different events that have the same breakdown values

  // Detect if we have breakdowns: when there are no breakdowns, name arrays contain event names
  // When there are breakdowns, name arrays contain breakdown values (not event names)
  const hasBreakdowns = series.some(
    (serie) =>
      serie.name.length > 0 &&
      !events.some(
        (event) =>
          serie.name[0] === event.name || serie.name[0] === event.displayName,
      ),
  );

  const seriesByBreakdown = new Map<string, typeof series>();

  series.forEach((serie) => {
    let breakdownKey: string;

    if (hasBreakdowns) {
      // With breakdowns: use the entire name array as the breakdown key
      // The name array contains breakdown values (e.g., ["iOS"], ["Android"])
      breakdownKey = serie.name.join(':::');
    } else {
      // Without breakdowns: group all series together regardless of event name
      // This allows formulas to combine multiple events
      breakdownKey = '';
    }

    if (!seriesByBreakdown.has(breakdownKey)) {
      seriesByBreakdown.set(breakdownKey, []);
    }
    seriesByBreakdown.get(breakdownKey)!.push(serie);
  });

  // For each breakdown group, apply the formula
  const result: typeof series = [];

  for (const [breakdownKey, breakdownSeries] of seriesByBreakdown) {
    // Group series by event to ensure we have one series per event
    const seriesByEvent = new Map<string, (typeof series)[number]>();

    breakdownSeries.forEach((serie) => {
      const eventId = serie.event.id ?? serie.event.name;
      // If we already have a series for this event in this breakdown group, skip it
      // (shouldn't happen, but just in case)
      if (!seriesByEvent.has(eventId)) {
        seriesByEvent.set(eventId, serie);
      }
    });

    // Get all unique dates across all series in this breakdown group
    const allDates = new Set<string>();
    breakdownSeries.forEach((serie) => {
      serie.data.forEach((item) => {
        allDates.add(item.date);
      });
    });

    // Sort dates chronologically
    const sortedDates = Array.from(allDates).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );

    // Apply formula for each date, matching series by event index
    const formulaData = sortedDates.map((date) => {
      const scope: Record<string, number> = {};

      // Build scope using alphabet IDs (A, B, C, etc.) for each event
      // This matches how formulas are written (e.g., "A*100", "A/B", "A+B-C")
      events.forEach((event, eventIndex) => {
        const readableId = alphabetIds[eventIndex];
        if (!readableId) {
          throw new Error('no alphabet id for serie in withFormula');
        }

        // Find the series for this event in this breakdown group
        const eventId = event.id ?? event.name;
        const matchingSerie = seriesByEvent.get(eventId);

        // Find the data point for this date
        // If the series doesn't exist or the date is missing, use 0
        const dataPoint = matchingSerie?.data.find((d) => d.date === date);
        scope[readableId] = dataPoint?.count ?? 0;
      });

      // Evaluate the formula with the scope
      let count: number;
      try {
        count = mathjs.parse(formula).compile().evaluate(scope) as number;
      } catch (error) {
        // If formula evaluation fails, return 0
        count = 0;
      }

      return {
        date,
        count:
          Number.isNaN(count) || !Number.isFinite(count) ? 0 : round(count, 2),
        total_count: breakdownSeries[0]?.data.find((d) => d.date === date)
          ?.total_count,
      };
    });

    // Use the first series as a template, but replace its data with formula results
    // Preserve the breakdown labels (name array) from the original series
    const templateSerie = breakdownSeries[0]!;
    result.push({
      ...templateSerie,
      data: formulaData,
    });
  }

  return result;
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
  const includeEventAlphaId = input.events.length > 1;
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
            : includeEventAlphaId
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
