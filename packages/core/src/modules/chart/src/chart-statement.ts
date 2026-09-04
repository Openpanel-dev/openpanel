// V1's `getChartSql` / `getAggregateChartSql`: the Postgres cohort lookups a
// chart needs, then the pure fragment builders in chart.sql.ts. Lives beside
// them (not in chart.service.ts) so the engine can import it without pulling
// the service — which imports the engine — into a cycle.

import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import type { IGetChartDataInput } from '@openpanel/validation';
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

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

export async function fetchCohortsMetadata(
  cohortIds: string[]
): Promise<Map<string, CohortMetadata>> {
  if (cohortIds.length === 0) {
    return new Map();
  }
  const db = await loadDb();
  const cohorts = await db.cohort.findMany({
    where: { id: { in: cohortIds } },
    select: { id: true, name: true },
  });
  return new Map(cohorts.map((c) => [c.id, { id: c.id, name: c.name }]));
}

export async function fetchProjectCohorts(
  projectId: string
): Promise<CohortMetadata[]> {
  const db = await loadDb();
  return db.cohort.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
}

export async function resolveChartBreakdowns(
  projectId: string,
  requested: IGetChartDataInput['breakdowns']
): Promise<ResolvedChartBreakdowns> {
  const known = knownBreakdowns(requested);
  const allCohorts = requestsAllCohortsBreakdown(known)
    ? await fetchProjectCohorts(projectId)
    : [];
  const breakdowns = withoutEmptyAllCohortsBreakdown(known, allCohorts);
  const cohortMetadata = await fetchCohortsMetadata(
    collectBreakdownCohortIds(breakdowns)
  );
  return { breakdowns, allCohorts, cohortMetadata };
}

export async function getChartSql(input: ChartSqlInput): Promise<SqlFragment> {
  const resolved = await resolveChartBreakdowns(
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
  input: AggregateChartSqlInput
): Promise<SqlFragment> {
  const resolved = await resolveChartBreakdowns(
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
