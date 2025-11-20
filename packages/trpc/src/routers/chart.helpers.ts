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
  IChartEventItem,
  IChartFormula,
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
      !events.some((event) => {
        if (event.type === 'event') {
          return (
            serie.name[0] === event.name || serie.name[0] === event.displayName
          );
        }
        return false;
      }),
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
        // Only events (not formulas) are used in the old formula system
        if (event.type !== 'event') {
          scope[readableId] = 0;
          return;
        }
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

  const funnels = payload.events
    .filter(
      (event): event is IChartEventItem & { type: 'event' } =>
        event.type === 'event',
    )
    .map((event) => {
      const { sb, getWhere } = createSqlBuilder();
      sb.where = getEventFiltersWhereClause(event.filters);
      sb.where.name = `name = ${sqlstring.escape(event.name)}`;
      return getWhere().replace('WHERE ', '');
    });

  const commonWhere = `project_id = ${sqlstring.escape(projectId)} AND 
    created_at >= '${formatClickhouseDate(startDate)}' AND 
    created_at <= '${formatClickhouseDate(endDate)}'`;

  // Filter to only events (funnels don't support formulas)
  const eventNames = payload.events
    .filter((e): e is IChartEventItem & { type: 'event' } => e.type === 'event')
    .map((event) => sqlstring.escape(event.name));

  const innerSql = `SELECT
    ${funnelGroup[0]} AS ${funnelGroup[1]},
    windowFunnel(${funnelWindow}, 'strict_increase')(toUnixTimestamp(created_at), ${funnels.join(', ')}) AS level
  FROM ${TABLE_NAMES.events} e
  ${funnelGroup[0] === 'session_id' ? '' : `LEFT JOIN (SELECT profile_id, id FROM sessions WHERE ${commonWhere}) AS s ON s.id = e.session_id`}
  WHERE 
    ${commonWhere} AND
    name IN (${eventNames.join(', ')})
  GROUP BY ${funnelGroup[0]}`;

  const sql = `SELECT level, count() AS count FROM (${innerSql}) WHERE level != 0 GROUP BY level ORDER BY level DESC`;

  const funnel = await chQuery<{ level: number; count: number }>(sql);
  const maxLevel = payload.events.length;
  const filledFunnelRes = fillFunnel(funnel, maxLevel);

  const totalSessions = last(filledFunnelRes)?.count ?? 0;
  const steps = reverse(filledFunnelRes).reduce(
    (acc, item, index, list) => {
      const prev = list[index - 1] ?? { count: totalSessions };
      const eventItem = payload.events[item.level - 1]!;
      // Funnels only work with events, not formulas
      if (eventItem.type !== 'event') {
        return acc;
      }
      const event = eventItem;
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

// Normalize events to ensure they have a type field
function normalizeEventItem(
  item: IChartEventItem | IChartEvent,
): IChartEventItem {
  if ('type' in item) {
    return item;
  }
  // Old format without type field - assume it's an event
  return { ...item, type: 'event' as const };
}

// Calculate formula result from previous series
function calculateFormulaSeries(
  formula: IChartFormula,
  previousSeries: Awaited<ReturnType<typeof getChartSerie>>,
  normalizedEvents: IChartEventItem[],
  formulaIndex: number,
): Awaited<ReturnType<typeof getChartSerie>> {
  if (!previousSeries || previousSeries.length === 0) {
    return [];
  }

  if (!previousSeries[0]?.data) {
    return [];
  }

  // Detect if we have breakdowns by checking if series names contain breakdown values
  // (not event/formula names)
  const hasBreakdowns = previousSeries.some(
    (serie) =>
      serie.name.length > 1 || // Multiple name parts = breakdowns
      (serie.name.length === 1 &&
        !normalizedEvents
          .slice(0, formulaIndex)
          .some(
            (event) =>
              event.type === 'event' &&
              (serie.name[0] === event.name ||
                serie.name[0] === event.displayName),
          ) &&
        !normalizedEvents
          .slice(0, formulaIndex)
          .some(
            (event) =>
              event.type === 'formula' &&
              (serie.name[0] === event.displayName ||
                serie.name[0] === event.formula),
          )),
  );

  const seriesByBreakdown = new Map<
    string,
    Awaited<ReturnType<typeof getChartSerie>>
  >();

  previousSeries.forEach((serie) => {
    let breakdownKey: string;

    if (hasBreakdowns) {
      // With breakdowns: use the entire name array as the breakdown key
      // Skip the first element (event/formula name) and use breakdown values
      breakdownKey = serie.name.slice(1).join(':::');
    } else {
      // Without breakdowns: group all series together
      // This allows formulas to combine multiple events/formulas
      breakdownKey = '';
    }

    if (!seriesByBreakdown.has(breakdownKey)) {
      seriesByBreakdown.set(breakdownKey, []);
    }
    seriesByBreakdown.get(breakdownKey)!.push(serie);
  });

  const result: Awaited<ReturnType<typeof getChartSerie>> = [];

  for (const [breakdownKey, breakdownSeries] of seriesByBreakdown) {
    // Group series by event index to ensure we have one series per event
    const seriesByEventIndex = new Map<
      number,
      (typeof previousSeries)[number]
    >();

    breakdownSeries.forEach((serie) => {
      // Find which event index this series belongs to
      const eventIndex = normalizedEvents
        .slice(0, formulaIndex)
        .findIndex((event) => {
          if (event.type === 'event') {
            const eventId = event.id ?? event.name;
            return (
              serie.event.id === eventId || serie.event.name === event.name
            );
          }
          return false;
        });

      if (eventIndex >= 0 && !seriesByEventIndex.has(eventIndex)) {
        seriesByEventIndex.set(eventIndex, serie);
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

    // Apply formula for each date
    const formulaData = sortedDates.map((date) => {
      const scope: Record<string, number> = {};

      // Build scope using alphabet IDs (A, B, C, etc.) for each event before this formula
      normalizedEvents.slice(0, formulaIndex).forEach((event, eventIndex) => {
        const readableId = alphabetIds[eventIndex];
        if (!readableId) {
          return;
        }

        if (event.type === 'event') {
          const matchingSerie = seriesByEventIndex.get(eventIndex);
          const dataPoint = matchingSerie?.data.find((d) => d.date === date);
          scope[readableId] = dataPoint?.count ?? 0;
        } else {
          // If it's a formula, we need to get its calculated value
          // This handles nested formulas
          const formulaSerie = breakdownSeries.find(
            (s) => s.event.id === event.id,
          );
          const dataPoint = formulaSerie?.data.find((d) => d.date === date);
          scope[readableId] = dataPoint?.count ?? 0;
        }
      });

      // Evaluate the formula with the scope
      let count: number;
      try {
        count = mathjs
          .parse(formula.formula)
          .compile()
          .evaluate(scope) as number;
      } catch (error) {
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

    // Use the first series as a template
    const templateSerie = breakdownSeries[0]!;

    // For formulas, construct the name array:
    // - Without breakdowns: use formula displayName/formula
    // - With breakdowns: use formula displayName/formula as first element, then breakdown values
    let formulaName: string[];
    if (hasBreakdowns) {
      // With breakdowns: formula name + breakdown values (skip first element which is event/formula name)
      const formulaDisplayName = formula.displayName || formula.formula;
      formulaName = [formulaDisplayName, ...templateSerie.name.slice(1)];
    } else {
      // Without breakdowns: just formula name
      formulaName = [formula.displayName || formula.formula];
    }

    result.push({
      ...templateSerie,
      name: formulaName,
      // For formulas, create a simplified event object
      // We use 'as' because formulas don't have segment/filters, but the event
      // object is only used for id/name lookups later, so this is safe
      event: {
        id: formula.id,
        name: formula.displayName || formula.formula,
        displayName: formula.displayName,
        segment: 'event' as const,
        filters: [],
      } as IChartEvent,
      data: formulaData,
    });
  }

  return result;
}

export type IGetChartSerie = Awaited<ReturnType<typeof getChartSeries>>[number];
export async function getChartSeries(
  input: IChartInputWithDates,
  timezone: string,
) {
  // Normalize all events to have type field
  const normalizedEvents = input.events.map(normalizeEventItem);

  // Process events sequentially - events fetch data, formulas calculate from previous series
  const allSeries: Awaited<ReturnType<typeof getChartSerie>> = [];

  for (let i = 0; i < normalizedEvents.length; i++) {
    const item = normalizedEvents[i]!;

    if (item.type === 'event') {
      // Fetch data for event
      const eventSeries = await getChartSerie(
        {
          ...input,
          event: item,
        },
        timezone,
      );
      allSeries.push(...eventSeries);
    } else if (item.type === 'formula') {
      // Calculate formula from previous series
      const formulaSeries = calculateFormulaSeries(
        item,
        allSeries,
        normalizedEvents,
        i,
      );
      allSeries.push(...formulaSeries);
    }
  }

  // Apply top-level formula if present (for backward compatibility)
  try {
    if (input.formula) {
      return withFormula(input, allSeries);
    }
  } catch (e) {
    // If formula evaluation fails, return series as-is
  }

  return allSeries;
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

  // Normalize events for consistent handling
  const normalizedEvents = input.events.map(normalizeEventItem);

  const getSerieId = (serie: IGetChartSerie) =>
    [slug(serie.name.join('-')), serie.event.id].filter(Boolean).join('-');
  const result = await Promise.all(promises);
  const series = result[0]!;
  const previousSeries = result[1];
  const limit = input.limit || 300;
  const offset = input.offset || 0;
  const includeEventAlphaId = normalizedEvents.length > 1;

  // Calculate metrics cache for formulas
  // Map<eventIndex, Map<breakdownSignature, metrics>>
  const metricsCache = new Map<
    number,
    Map<
      string,
      {
        sum: number;
        average: number;
        min: number;
        max: number;
        count: number;
      }
    >
  >();

  // Initialize cache
  for (let i = 0; i < normalizedEvents.length; i++) {
    metricsCache.set(i, new Map());
  }

  // First pass: calculate standard metrics for all series and populate cache
  // We iterate through series in order, but since series array is flattened, we need to be careful.
  // Fortunately, events are processed sequentially, so dependencies usually appear before formulas.
  // However, to be safe, we'll compute metrics for all series first.

  const seriesWithMetrics = series.map((serie) => {
    // Find the index of the event/formula that produced this series
    const eventIndex = normalizedEvents.findIndex((event) => {
      if (event.type === 'event') {
        return event.id === serie.event.id || event.name === serie.event.name;
      }
      return event.id === serie.event.id;
    });

    const standardMetrics = {
      sum: sum(serie.data.map((item) => item.count)),
      average: round(average(serie.data.map((item) => item.count)), 2),
      min: min(serie.data.map((item) => item.count)),
      max: max(serie.data.map((item) => item.count)),
      count: serie.data.find((item) => !!item.total_count)?.total_count || 0,
    };

    // Store in cache
    if (eventIndex >= 0) {
      const breakdownSignature = serie.name.slice(1).join(':::');
      metricsCache.get(eventIndex)?.set(breakdownSignature, standardMetrics);
    }

    return {
      serie,
      eventIndex,
      metrics: standardMetrics,
    };
  });

  // Second pass: Re-calculate metrics for formulas using dependency metrics
  // We iterate through normalizedEvents to process in dependency order
  normalizedEvents.forEach((event, eventIndex) => {
    if (event.type !== 'formula') return;

    // We dont have count on formulas so use sum instead
    const property = 'count';
    // Iterate through all series corresponding to this formula
    seriesWithMetrics.forEach((item) => {
      if (item.eventIndex !== eventIndex) return;

      const breakdownSignature = item.serie.name.slice(1).join(':::');
      const scope: Record<string, number> = {};

      // Build scope from dependency metrics
      normalizedEvents.slice(0, eventIndex).forEach((depEvent, depIndex) => {
        const readableId = alphabetIds[depIndex];
        if (!readableId) return;

        // Get metric from cache for the dependency with the same breakdown signature
        const depMetrics = metricsCache.get(depIndex)?.get(breakdownSignature);
        // Use sum as the default metric for formula calculation on totals
        scope[readableId] = depMetrics?.[property] ?? 0;
      });

      // Evaluate formula
      let calculatedSum: number;
      try {
        calculatedSum = mathjs
          .parse(event.formula)
          .compile()
          .evaluate(scope) as number;
      } catch (error) {
        calculatedSum = 0;
      }

      // Update metrics with calculated sum
      // For formulas, the "sum" metric (Total) should be the result of the formula applied to the totals
      // The "average" metric usually remains average of data points, or calculatedSum / intervals
      item.metrics = {
        ...item.metrics,
        [property]:
          Number.isNaN(calculatedSum) || !Number.isFinite(calculatedSum)
            ? 0
            : round(calculatedSum, 2),
      };

      // Update cache with new metrics so dependent formulas can use it
      metricsCache.get(eventIndex)?.set(breakdownSignature, item.metrics);
    });
  });

  const final: FinalChart = {
    series: seriesWithMetrics.map(({ serie, eventIndex, metrics }) => {
      const alphaId = alphabetIds[eventIndex];
      const previousSerie = previousSeries?.find(
        (prevSerie) => getSerieId(prevSerie) === getSerieId(serie),
      );

      // Determine if this is a formula series
      const isFormula = normalizedEvents[eventIndex]?.type === 'formula';
      const eventItem = normalizedEvents[eventIndex];

      const event = {
        id: serie.event.id,
        name: serie.event.displayName || serie.event.name,
      };

      // Construct names array based on whether it's a formula or event
      let names: string[];
      if (isFormula && eventItem?.type === 'formula') {
        // For formulas:
        // - Without breakdowns: use displayName/formula (with optional alpha ID)
        // - With breakdowns: use displayName/formula + breakdown values (with optional alpha ID)
        const formulaDisplayName = eventItem.displayName || eventItem.formula;
        if (input.breakdowns.length === 0) {
          // No breakdowns: just formula name
          names = includeEventAlphaId
            ? [`(${alphaId}) ${formulaDisplayName}`]
            : [formulaDisplayName];
        } else {
          // With breakdowns: formula name + breakdown values
          names = includeEventAlphaId
            ? [`(${alphaId}) ${formulaDisplayName}`, ...serie.name.slice(1)]
            : [formulaDisplayName, ...serie.name.slice(1)];
        }
      } else {
        // For events: use existing logic
        names =
          input.breakdowns.length === 0 && serie.event.displayName
            ? [serie.event.displayName]
            : includeEventAlphaId
              ? [`(${alphaId}) ${serie.name[0]}`, ...serie.name.slice(1)]
              : serie.name;
      }

      return {
        id: getSerieId(serie),
        names,
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
