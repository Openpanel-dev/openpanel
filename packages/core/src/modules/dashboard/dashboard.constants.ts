import { z } from 'zod';
import {
  getCohortIds,
  type IChartEventFilter,
  zChartEventFilter,
} from '../report/report.constants';

export const zDashboardFilters = z.array(zChartEventFilter);

const VALUELESS_OPERATORS: readonly IChartEventFilter['operator'][] = [
  'isNull',
  'isNotNull',
];

function isCohortFilter(filter: IChartEventFilter): boolean {
  return filter.operator === 'inCohort' || filter.operator === 'notInCohort';
}

/** A filter still being edited (no value or no cohort picked yet) narrows
 *  nothing, so leaving it out keeps every tile from refetching the same data. */
function narrowsResults(filter: IChartEventFilter): boolean {
  if (isCohortFilter(filter)) {
    return getCohortIds(filter).length > 0;
  }
  if (VALUELESS_OPERATORS.includes(filter.operator)) {
    return true;
  }
  return filter.value.length > 0;
}

/**
 * Dashboard filters are ANDed after the report's own global filters and never
 * replace them, so a tile can only narrow what its report shows.
 */
export function mergeDashboardFilters(
  reportFilters: IChartEventFilter[] | undefined,
  dashboardFilters: IChartEventFilter[] | undefined
): IChartEventFilter[] {
  const own = reportFilters ?? [];
  const active = (dashboardFilters ?? []).filter(narrowsResults);
  if (active.length === 0) {
    return own;
  }
  return [...own, ...active];
}

/** The saved column is plain JSON: an entry that no longer validates is
 *  dropped instead of breaking every tile on the dashboard. */
export function parseDashboardFilters(raw: unknown): IChartEventFilter[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    const parsed = zChartEventFilter.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Values are compared as strings because filters kept in the URL lose their
 *  original value types; ids are ignored because they only key React rows. */
function filterSignature(filter: IChartEventFilter): string {
  return JSON.stringify([
    filter.name,
    filter.operator,
    filter.type ?? null,
    filter.value.map((value) => String(value ?? '')),
    getCohortIds(filter),
  ]);
}

export function isSameDashboardFilters(
  a: IChartEventFilter[],
  b: IChartEventFilter[]
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every(
    (filter, index) => filterSignature(filter) === filterSignature(b[index]!)
  );
}
