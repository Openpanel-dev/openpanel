import type { ServiceDeps } from '../../../../services';
import { stripFixedStringPadding } from '../../../../shared/ch-fixed-string';
import type { ISerieDataItem } from '../../../../shared/group-by-labels';
import { groupByLabels } from '../../../../shared/group-by-labels';
import type {
  IChartBreakdown,
  IChartEventFilter,
  IChartEventItem,
  IGetChartDataInput,
} from '../../../report/report.constants';
import {
  alphabetIds,
  perUserBucketKind,
} from '../../../report/report.constants';
import { mapWithConcurrency } from '../concurrency';
import { runQuery } from '../run-query';
import type { DistributionBinRange } from '../sql';
import {
  getAggregateChartSql,
  getChartSql,
  getDistributionRangeSql,
} from '../statement';
import type { NormalizedInput } from './normalize';
import type { ConcreteSeries, Plan, SeriesDefinition } from './types';

type EventDefinition = IChartEventItem & { type: 'event' };

/**
 * In-flight ClickHouse statements per period while a chart's series are
 * fetched. ClickHouse runs each of these statements at `max_threads = 4` on a
 * 4-core node, so extra concurrency buys overlap of round-trip and merge wait,
 * not CPU: past a handful the statements queue behind each other and the wall
 * clock stops improving. Four per period — and `executeChart` runs the current
 * and previous periods together — keeps a typical 1-3 series comparison chart
 * at one round trip while capping the fan-out at eight.
 */
const SERIES_FETCH_CONCURRENCY = 4;

function runChartQuery(
  deps: ServiceDeps,
  statement: Awaited<ReturnType<typeof getChartSql>>,
  timezone: string
): Promise<ISerieDataItem[]> {
  return runQuery<ISerieDataItem>(deps, statement, timezone);
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

const BREAKDOWN_LABEL_KEYS = ['label_1', 'label_2', 'label_3'] as const;

/**
 * A `WITH FILL` row carries each label column's type default: `\0\0` for the
 * `FixedString(2)` country, the epoch for a date. Grouped as-is those became a
 * zero series named after the default. A real row always has `label_0` (the
 * event name or `*`), so a fill row keeps only its date and count, which still
 * pads every series to the full range. A real row without geo also comes back
 * NUL-padded; it reads as an empty value, like any other unset breakdown.
 */
function readableLabels(row: ISerieDataItem): ISerieDataItem {
  if (!row.label_0) {
    return {
      label_0: '',
      date: row.date,
      count: row.count,
      total_count: row.total_count,
    };
  }
  const labels: Partial<ISerieDataItem> = {};
  for (const key of BREAKDOWN_LABEL_KEYS) {
    const value = row[key];
    if (typeof value === 'string') {
      labels[key] = stripFixedStringPadding(value);
    }
  }
  return { ...row, ...labels };
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
  return groupByLabels(rows.map(readableLabels)).map((grouped) => {
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
    anyOf: event.anyOf,
    perUser: event.perUser,
    firstTime: event.firstTime,
  };
}

function seriesQueryInput(
  plan: Plan,
  event: EventDefinition
): IGetChartDataInput & { timezone: string } {
  return {
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
    timezone: plan.timezone,
  };
}

interface SeriesRange extends DistributionBinRange {
  users: number;
}

/** A series' value range, over the same rows `fetch` ends up charting for it. */
async function seriesBinRange(
  deps: ServiceDeps,
  plan: Plan,
  event: EventDefinition
): Promise<SeriesRange | undefined> {
  const input = seriesQueryInput(plan, event);
  const [range] = await runQuery<SeriesRange>(
    deps,
    await getDistributionRangeSql(deps, input),
    plan.timezone
  );
  if (range?.users || plan.input.breakdowns.length === 0) {
    return range?.users ? range : undefined;
  }
  const [unbrokenRange] = await runQuery<SeriesRange>(
    deps,
    await getDistributionRangeSql(deps, { ...input, breakdowns: [] }),
    plan.timezone
  );
  return unbrokenRange?.users ? unbrokenRange : undefined;
}

/**
 * The range every binned series of a distribution shares, so their bins line
 * up. One series is left alone: its query finds its own range for free.
 */
async function sharedBinRange(
  deps: ServiceDeps,
  plan: Plan,
  events: EventDefinition[]
): Promise<DistributionBinRange | undefined> {
  if (plan.input.chartType !== 'distribution') {
    return undefined;
  }
  const binned = events.filter(
    ({ perUser }) =>
      perUser?.property && perUserBucketKind(perUser.aggregation) === 'binned'
  );
  if (binned.length < 2) {
    return undefined;
  }
  const ranges = await mapWithConcurrency(
    binned,
    SERIES_FETCH_CONCURRENCY,
    (event) => seriesBinRange(deps, plan, event)
  );
  const found = ranges.filter((range) => range !== undefined);
  if (found.length === 0) {
    return undefined;
  }
  return {
    lo: Math.min(...found.map((range) => range.lo)),
    hi: Math.max(...found.map((range) => range.hi)),
  };
}

/** Fetch every event series of the plan; breakdown expansion included. */
export async function fetch(
  deps: ServiceDeps,
  plan: Plan
): Promise<ConcreteSeries[]> {
  const fetchable = [...plan.definitions.entries()].flatMap(
    ([index, definition]) => {
      if (definition.type !== 'event') {
        return [];
      }
      const placeholder = plan.concreteSeries.find(
        (series) => series.definitionId === definition.id
      );
      return placeholder ? [{ index, definition, placeholder }] : [];
    }
  );

  const binRange = await sharedBinRange(
    deps,
    plan,
    fetchable.map(({ definition }) => definition as EventDefinition)
  );

  const perDefinition = await mapWithConcurrency(
    fetchable,
    SERIES_FETCH_CONCURRENCY,
    async ({ index, definition, placeholder }) => {
      const event = definition as EventDefinition;
      const queryInput = { ...seriesQueryInput(plan, event), binRange };

      let rows = await runChartQuery(
        deps,
        await getChartSql(deps, queryInput),
        plan.timezone
      );
      // Nothing matched the breakdown: fall back to the plain series.
      if (rows.length === 0 && plan.input.breakdowns.length > 0) {
        rows = await runChartQuery(
          deps,
          await getChartSql(deps, {
            ...queryInput,
            breakdowns: [],
          }),
          plan.timezone
        );
      }

      return expandGroupedRows({
        rows,
        breakdowns: plan.input.breakdowns,
        event,
        definition,
        definitionIndex: index,
        seriesId: (nameParts) => `${placeholder.id}-${nameParts.join('-')}`,
      });
    }
  );

  return perDefinition.flat();
}

/**
 * Aggregate (bar/pie) counterpart of `fetch`: one row per label group with a
 * constant date, for the given period.
 */
export async function fetchAggregate(
  deps: ServiceDeps,
  normalized: NormalizedInput,
  period: { startDate: string; endDate: string },
  timezone: string
): Promise<ConcreteSeries[]> {
  const fetchable = [...normalized.series.entries()].filter(
    ([, definition]) => definition.type === 'event'
  );

  const perDefinition = await mapWithConcurrency(
    fetchable,
    SERIES_FETCH_CONCURRENCY,
    async ([index, definition]) => {
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
        deps,
        await getAggregateChartSql(deps, queryInput),
        timezone
      );
      if (rows.length === 0 && normalized.breakdowns.length > 0) {
        rows = await runChartQuery(
          deps,
          await getAggregateChartSql(deps, { ...queryInput, breakdowns: [] }),
          timezone
        );
      }

      return expandGroupedRows({
        rows,
        breakdowns: normalized.breakdowns,
        event,
        definition,
        definitionIndex: index,
        seriesId: (nameParts) =>
          `${event.name}-${nameParts.join('-')}-${index}`,
      });
    }
  );

  return perDefinition.flat();
}
