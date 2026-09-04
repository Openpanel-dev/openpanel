import type { ISerieDataItem } from '@openpanel/common';
import { groupByLabels } from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';
import type {
  IChartBreakdown,
  IChartEventFilter,
  IChartEventItem,
  IGetChartDataInput,
} from '@openpanel/validation';
import { getAggregateChartSql, getChartSql } from '../chart-statement';
import type { NormalizedInput } from './normalize';
import type { ConcreteSeries, Plan, SeriesDefinition } from './types';

type EventDefinition = IChartEventItem & { type: 'event' };

function loadChClient() {
  return import('@openpanel/db/src/clickhouse/client');
}

async function runChartQuery(
  statement: Awaited<ReturnType<typeof getChartSql>>,
  timezone: string
): Promise<ISerieDataItem[]> {
  const { chQuery } = await loadChClient();
  return chQuery<ISerieDataItem>(statement, { session_timezone: timezone });
}

function breakdownFilters(
  breakdowns: IChartBreakdown[],
  nameParts: string[]
): IChartEventFilter[] {
  const filters: IChartEventFilter[] = [];
  breakdowns.forEach((breakdown, index) => {
    const value = nameParts[index + 1];
    if (value) {
      filters.push({
        id: `breakdown-${index}`,
        name: breakdown.name,
        operator: 'is',
        value: [value],
      });
    }
  });
  return filters;
}

function breakdownValues(
  breakdowns: IChartBreakdown[],
  nameParts: string[]
): Record<string, string> {
  const values: Record<string, string> = {};
  breakdowns.forEach((breakdown, index) => {
    const value = nameParts[index + 1];
    if (value) {
      values[breakdown.name] = value;
    }
  });
  return values;
}

/**
 * One ConcreteSeries per label group. `name[0]` is the event name, `name[1+]`
 * the breakdown values the row was grouped on.
 */
function expandGroupedRows({
  rows,
  breakdowns,
  event,
  definition,
  definitionIndex,
  seriesId,
}: {
  rows: ISerieDataItem[];
  breakdowns: IChartBreakdown[];
  event: EventDefinition;
  definition: SeriesDefinition;
  definitionIndex: number;
  seriesId: (nameParts: string[]) => string;
}): ConcreteSeries[] {
  return groupByLabels(rows).map((grouped) => {
    const hasBreakdownParts = breakdowns.length > 0 && grouped.name.length > 1;
    const breakdownValue = hasBreakdownParts
      ? grouped.name.slice(1).join(' - ')
      : undefined;
    return {
      id: seriesId(grouped.name),
      definitionId:
        definition.id ??
        alphabetIds[definitionIndex] ??
        `series-${definitionIndex}`,
      definitionIndex,
      name: grouped.name,
      context: {
        event: event.name,
        filters: breakdownValue
          ? [...event.filters, ...breakdownFilters(breakdowns, grouped.name)]
          : [...event.filters],
        breakdownValue,
        breakdowns: hasBreakdownParts
          ? breakdownValues(breakdowns, grouped.name)
          : undefined,
      },
      data: grouped.data.map((item) => ({
        date: item.date,
        count: item.count,
        total_count: item.total_count,
      })),
      definition,
    };
  });
}

function queryEvent(event: EventDefinition): IGetChartDataInput['event'] {
  return {
    id: event.id,
    name: event.name,
    segment: event.segment,
    filters: event.filters,
    displayName: event.displayName,
    property: event.property,
  };
}

/** Fetch every event series of the plan; breakdown expansion included. */
export async function fetch(plan: Plan): Promise<ConcreteSeries[]> {
  const results: ConcreteSeries[] = [];

  for (const [index, definition] of plan.definitions.entries()) {
    if (definition.type !== 'event') {
      continue;
    }
    const event = definition as EventDefinition;
    const placeholder = plan.concreteSeries.find(
      (series) => series.definitionId === definition.id
    );
    if (!placeholder) {
      continue;
    }

    const queryInput: IGetChartDataInput = {
      event: queryEvent(event),
      projectId: plan.input.projectId,
      startDate: plan.input.startDate,
      endDate: plan.input.endDate,
      breakdowns: plan.input.breakdowns,
      interval: plan.input.interval,
      chartType: plan.input.chartType,
      metric: plan.input.metric,
      previous: plan.input.previous ?? false,
      limit: plan.input.limit,
      offset: plan.input.offset,
    };

    let rows = await runChartQuery(
      await getChartSql({ ...queryInput, timezone: plan.timezone }),
      plan.timezone
    );
    // Nothing matched the breakdown: fall back to the plain series.
    if (rows.length === 0 && plan.input.breakdowns.length > 0) {
      rows = await runChartQuery(
        await getChartSql({
          ...queryInput,
          breakdowns: [],
          timezone: plan.timezone,
        }),
        plan.timezone
      );
    }

    results.push(
      ...expandGroupedRows({
        rows,
        breakdowns: plan.input.breakdowns,
        event,
        definition,
        definitionIndex: index,
        seriesId: (nameParts) => `${placeholder.id}-${nameParts.join('-')}`,
      })
    );
  }

  return results;
}

/**
 * Aggregate (bar/pie) counterpart of `fetch`: one row per label group with a
 * constant date, for the given period.
 */
export async function fetchAggregate(
  normalized: NormalizedInput,
  period: { startDate: string; endDate: string },
  timezone: string
): Promise<ConcreteSeries[]> {
  const results: ConcreteSeries[] = [];

  for (const [index, definition] of normalized.series.entries()) {
    if (definition.type !== 'event') {
      continue;
    }
    const event = definition as EventDefinition;

    const queryInput = {
      event: queryEvent(event),
      projectId: normalized.projectId,
      startDate: period.startDate,
      endDate: period.endDate,
      breakdowns: normalized.breakdowns,
      limit: normalized.limit,
      metric: normalized.metric,
      previous: normalized.previous,
      timezone,
    };

    let rows = await runChartQuery(
      await getAggregateChartSql(queryInput),
      timezone
    );
    if (rows.length === 0 && normalized.breakdowns.length > 0) {
      rows = await runChartQuery(
        await getAggregateChartSql({ ...queryInput, breakdowns: [] }),
        timezone
      );
    }

    results.push(
      ...expandGroupedRows({
        rows,
        breakdowns: normalized.breakdowns,
        event,
        definition,
        definitionIndex: index,
        seriesId: (nameParts) =>
          `${event.name}-${nameParts.join('-')}-${index}`,
      })
    );
  }

  return results;
}
