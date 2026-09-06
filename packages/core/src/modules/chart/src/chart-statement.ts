// V1's `getChartSql` / `getAggregateChartSql`: the Postgres cohort lookups a
// chart needs, then the pure fragment builders in chart.sql.ts. Lives beside
// them (not in chart.service.ts) so the engine can import it without pulling
// the service — which imports the engine — into a cycle.

import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import type { ServiceDeps } from '../../../services';
import type { IGetChartDataInput } from '../../report/report.constants';
import {
  aggregateChartQuery,
  chartSeriesQuery,
  knownBreakdowns,
  type ResolvedChartBreakdowns,
  requestsAllCohortsBreakdown,
  withoutEmptyAllCohortsBreakdown,
} from './chart.sql';
import type { CohortMetadata } from './field-resolution';
import { collectBreakdownCohortIds } from './field-resolution';

export type ChartSqlInput = IGetChartDataInput & { timezone: string };
export type AggregateChartSqlInput = Omit<
  IGetChartDataInput,
  'interval' | 'chartType'
> & { timezone: string };

export async function fetchCohortsMetadata(
  deps: ServiceDeps,
  cohortIds: string[]
): Promise<Map<string, CohortMetadata>> {
  if (cohortIds.length === 0) {
    return new Map();
  }
  const cohorts = await deps.db.cohort.findMany({
    where: { id: { in: cohortIds } },
    select: { id: true, name: true },
  });
  return new Map(cohorts.map((c) => [c.id, { id: c.id, name: c.name }]));
}

export function fetchProjectCohorts(
  deps: ServiceDeps,
  projectId: string
): Promise<CohortMetadata[]> {
  return deps.db.cohort.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
}

export async function resolveChartBreakdowns(
  deps: ServiceDeps,
  projectId: string,
  requested: IGetChartDataInput['breakdowns']
): Promise<ResolvedChartBreakdowns> {
  const known = knownBreakdowns(requested);
  const allCohorts = requestsAllCohortsBreakdown(known)
    ? await fetchProjectCohorts(deps, projectId)
    : [];
  const breakdowns = withoutEmptyAllCohortsBreakdown(known, allCohorts);
  const cohortMetadata = await fetchCohortsMetadata(
    deps,
    collectBreakdownCohortIds(breakdowns)
  );
  return { breakdowns, allCohorts, cohortMetadata };
}

export async function getChartSql(
  deps: ServiceDeps,
  input: ChartSqlInput
): Promise<SqlFragment> {
  const resolved = await resolveChartBreakdowns(
    deps,
    input.projectId,
    input.breakdowns
  );
  return chartSeriesQuery({
    ...resolved,
    event: input.event,
    interval: input.interval,
    startDate: input.startDate,
    endDate: input.endDate,
    projectId: input.projectId,
    timezone: input.timezone,
  });
}

export async function getAggregateChartSql(
  deps: ServiceDeps,
  input: AggregateChartSqlInput
): Promise<SqlFragment> {
  const resolved = await resolveChartBreakdowns(
    deps,
    input.projectId,
    input.breakdowns
  );
  return aggregateChartQuery({
    ...resolved,
    event: input.event,
    startDate: input.startDate,
    endDate: input.endDate,
    projectId: input.projectId,
    limit: input.limit,
  });
}
