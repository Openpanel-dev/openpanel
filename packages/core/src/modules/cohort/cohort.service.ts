// Moved from packages/db/src/services/cohort.service.ts (M5-003). The
// producer wrapper (`enqueueCohortCompute`) moves here too — db cannot hold
// producers (ADR-007's discovery: "packages/db/src/services/cohort.service.ts:12
// imports cohortComputeQueue from @openpanel/queue" was flagged as reaching
// back into infrastructure it should not know about). packages/db loses this
// file entirely: nothing outside trpc/worker/this module's own tests reached
// it through @openpanel/db's barrel.
//
// db/ch access is LAZY (`load*` below), not a static top-level import — see
// insight.service.ts's header for the full reasoning (jobs.registry.ts and
// services.ts pull this module into the eager barrel chain nearly every core
// test file reaches, and constructing @openpanel/db's clients at import time
// would spawn a pino-pretty transport worker thread per test file).
//
// ClickHouse queries here still go through raw sqlstring-escaped strings, not
// the `sql` tag: ADR-013 converts the analytics read path one query per P7
// task, and this module's queries haven't been converted yet. Table names are
// a local literal map (`TABLE`, below), not @openpanel/db's `TABLE_NAMES`: the
// latter lives in the same module as `ch`/`chQuery` (clickhouse/client.ts,
// which constructs a real pino logger at import time — the exact cost the lazy
// loads elsewhere in this file exist to defer), and this module's SQL builders
// are pure sync functions the P2 SQL-shape tests call with no ClickHouse
// connection at all.
//
// V1's trpc router (packages/trpc/src/routers/cohort.ts) and worker cron job
// (apps/worker/src/jobs/cron.cohort-refresh.ts) stay live (DELEGATE PATTERN)
// and enqueue by calling @openpanel/queue's cohortComputeQueue directly,
// same as gsc's V1 router/worker do for gscQueue (M5-002) — @openpanel/queue
// itself imports @openpanel/core for its logger (packages/queue/src/queues.ts),
// so core cannot import @openpanel/queue back without a real package cycle.
// `CohortService.enqueueCompute` (below) is the canonical, ctx.queues-based
// wrapper for callers that already have a Ctx (this module's own rpc
// mutations and its cron fragment).

import type { ClickHouseSettings } from '@clickhouse/client';
import type { IServiceProfile } from '@openpanel/core';
import type { IChartEventFilter } from '@openpanel/validation';
import sqlstring from 'sqlstring';
import type { ServiceDeps } from '../../services';
import type {
  CohortDefinition,
  EventBasedCohortDefinition,
  EventCriteria,
  Frequency,
  PropertyBasedCohortDefinition,
  Timeframe,
} from './cohort.constants';

// Physical ClickHouse table names this module reads/writes. Literal, not
// imported from @openpanel/db's TABLE_NAMES — see the header comment.
const TABLE = {
  profiles: 'profiles',
  events: 'events',
  cohortMembers: 'cohort_members',
  cohortMetadata: 'cohort_metadata',
  eventProfileSummaryMv: 'event_profile_summary_mv',
  eventPropertyProfileSummaryMv: 'event_property_profile_summary_mv',
} as const;

// Max members materialized into cohort_members per compute. Cohorts larger
// than this are silently truncated to an arbitrary subset, so deployments
// with bigger cohorts need to raise it — env-tunable to avoid an image
// rebuild for what is really a sizing knob.
//
// Strictly a positive safe integer: anything else falls back to the
// default. Number.parseInt would accept '5000junk' or '-1' (LIMIT -1 is a
// query error), and 0 is falsy at the `limit ? LIMIT ... : ''` call sites,
// which would silently remove the cap entirely.
function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!(raw && /^\d+$/.test(raw))) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const COHORT_MATERIALIZE_LIMIT_PARSED = parsePositiveInt(
  process.env.COHORT_MATERIALIZE_LIMIT
);
export const COHORT_MATERIALIZE_LIMIT =
  COHORT_MATERIALIZE_LIMIT_PARSED ?? 10_000;

// Property cohorts aggregate every profile row for the project, so they are
// the one cohort query that can outgrow the server's memory headroom. Two
// opt-in knobs bound them; with NEITHER set, no per-query settings are
// applied and the server's own defaults govern — upstream behavior is
// unchanged.
//
//   COHORT_QUERY_MEMORY_LIMIT_BYTES  hard cap for these queries
//   COHORT_QUERY_SPILL_BYTES         GROUP BY spills to disk past this
//
// A GROUP BY only starts spilling once it crosses the threshold, so the
// spill threshold must sit BELOW the memory limit — inverted, the query is
// killed before it ever writes to disk (ClickHouse Cloud ships exactly that
// inversion by default, which is how these queries OOM'd instead of
// spilling). When only the limit is set — or the pair is inverted — the
// threshold derives as limit/3. Spilling early costs little: the volume
// spilled is set by the data, not the threshold (measured on 8.3M profiles,
// ~281MB spilled whether the threshold was 300, 512 or 768MB, at
// 6.9s/6.7s/6.0s, while peak memory climbed 410/695/893MiB).
//
// A standalone function of its raw env inputs (not a module-level read), so
// a test can exercise every branch by calling it directly — bun:test shares
// one module registry per file even under --isolate, so vitest's
// vi.resetModules()-per-case porting has no equivalent (see AGENTS.md; this
// was the one vi.resetModules site in the suite, ADR-010's tail table).
export function deriveCohortQuerySettings({
  memoryLimitBytesRaw,
  spillBytesRaw,
}: {
  memoryLimitBytesRaw: string | undefined;
  spillBytesRaw: string | undefined;
}): ClickHouseSettings {
  const memoryLimitBytes = parsePositiveInt(memoryLimitBytesRaw);
  const spillBytesParsed = parsePositiveInt(spillBytesRaw);
  const spillBytes =
    memoryLimitBytes !== undefined &&
    (spillBytesParsed === undefined || spillBytesParsed >= memoryLimitBytes)
      ? // Clamped to 1: a (nonsensical) limit below 3 would derive 0, and
        // max_bytes_before_external_group_by = 0 means spilling DISABLED —
        // the exact inversion this derivation exists to prevent.
        Math.max(1, Math.floor(memoryLimitBytes / 3))
      : spillBytesParsed;

  return {
    ...(spillBytes !== undefined
      ? { max_bytes_before_external_group_by: String(spillBytes) }
      : {}),
    ...(memoryLimitBytes !== undefined
      ? { max_memory_usage: String(memoryLimitBytes) }
      : {}),
  };
}

export const PROFILE_COHORT_QUERY_SETTINGS: ClickHouseSettings =
  deriveCohortQuerySettings({
    memoryLimitBytesRaw: process.env.COHORT_QUERY_MEMORY_LIMIT_BYTES,
    spillBytesRaw: process.env.COHORT_QUERY_SPILL_BYTES,
  });

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

function loadChClient() {
  return import('@openpanel/db/src/clickhouse/client');
}

function buildTimeConstraint(timeframe: Timeframe): string {
  if (timeframe.type === 'relative') {
    const match = timeframe.value.match(/^(\d+)d$/);
    if (!match) {
      throw new Error(`Invalid relative timeframe: ${timeframe.value}`);
    }
    const days = Number.parseInt(match[1]!, 10);
    return `created_at >= toDate(now() - INTERVAL ${days} DAY)`;
  }

  const start = timeframe.start;
  if (timeframe.end) {
    return `created_at BETWEEN toDate('${start}') AND toDate('${timeframe.end}')`;
  }
  return `created_at >= toDate('${start}')`;
}

function getFrequencyOperator(frequency: Frequency): string {
  switch (frequency.operator) {
    case 'gte':
      return `>= ${frequency.count}`;
    case 'eq':
      return `= ${frequency.count}`;
    case 'lte':
      return `<= ${frequency.count}`;
    default:
      return `>= ${frequency.count}`;
  }
}

export function buildEventCriteriaQuery(
  projectId: string,
  criteria: EventCriteria
): string {
  const { name, filters, timeframe, frequency } = criteria;
  const timeConstraint = buildTimeConstraint(timeframe);
  const hasEventPropertyFilters = filters.some(
    (f) =>
      f.name.startsWith('properties.') &&
      !f.name.startsWith('profile.properties.')
  );

  if (hasEventPropertyFilters) {
    const propertyFilters = filters.filter((f) =>
      f.name.startsWith('properties.')
    );

    const propertyConditions = propertyFilters
      .map((filter) => {
        const propertyKey = filter.name.replace('properties.', '');
        const { value, operator } = filter;

        switch (operator) {
          case 'is':
            if (value.length === 1) {
              return `(property_key = ${sqlstring.escape(propertyKey)} AND property_value = ${sqlstring.escape(String(value[0]).trim())})`;
            }
            return `(property_key = ${sqlstring.escape(propertyKey)} AND property_value IN (${value
              .map((val) => sqlstring.escape(String(val).trim()))
              .join(', ')}))`;
          case 'isNot':
            if (value.length === 1) {
              return `(property_key = ${sqlstring.escape(propertyKey)} AND property_value != ${sqlstring.escape(String(value[0]).trim())})`;
            }
            return `(property_key = ${sqlstring.escape(propertyKey)} AND property_value NOT IN (${value
              .map((val) => sqlstring.escape(String(val).trim()))
              .join(', ')}))`;
          case 'contains':
            return `(property_key = ${sqlstring.escape(propertyKey)} AND (${value
              .map(
                (val) =>
                  `property_value LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
              )
              .join(' OR ')}))`;
          case 'doesNotContain':
            return `(property_key = ${sqlstring.escape(propertyKey)} AND (${value
              .map(
                (val) =>
                  `property_value NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
              )
              .join(' AND ')}))`;
          default:
            return `(property_key = ${sqlstring.escape(propertyKey)} AND property_value IN (${value
              .map((val) => sqlstring.escape(String(val).trim()))
              .join(', ')}))`;
        }
      })
      .join(' OR ');

    if (frequency) {
      const frequencyOp = getFrequencyOperator(frequency);
      return `
        SELECT profile_id
        FROM ${TABLE.eventPropertyProfileSummaryMv}
        WHERE project_id = ${sqlstring.escape(projectId)}
          AND name = ${sqlstring.escape(name)}
          AND ${timeConstraint.replace('created_at', 'event_date')}
          AND (${propertyConditions})
        GROUP BY profile_id
        HAVING countMerge(event_count) ${frequencyOp}
      `;
    }

    return `
      SELECT DISTINCT profile_id
      FROM ${TABLE.eventPropertyProfileSummaryMv}
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND name = ${sqlstring.escape(name)}
        AND ${timeConstraint.replace('created_at', 'event_date')}
        AND (${propertyConditions})
    `;
  }

  if (frequency) {
    const frequencyOp = getFrequencyOperator(frequency);
    return `
      SELECT profile_id
      FROM ${TABLE.eventProfileSummaryMv}
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND name = ${sqlstring.escape(name)}
        AND ${timeConstraint.replace('created_at', 'event_date')}
      GROUP BY profile_id
      HAVING countMerge(event_count) ${frequencyOp}
    `;
  }

  return `
    SELECT DISTINCT profile_id
    FROM ${TABLE.eventProfileSummaryMv}
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND name = ${sqlstring.escape(name)}
      AND ${timeConstraint.replace('created_at', 'event_date')}
  `;
}

// SQL for a profile filter's column: either a properties Map lookup or a
// plain column, qualified with the table name.
function profileColumnAccess(name: string): string {
  const normalizedName = name.replace(/^profile\./, 'profiles.');
  if (normalizedName.startsWith('profiles.properties.')) {
    const propKey = normalizedName.replace('profiles.properties.', '');
    // Escaped: cohort definitions come from the API, so the key is
    // user-controlled — a quote in it must not terminate the literal.
    return `profiles.properties[${sqlstring.escape(propKey)}]`;
  }
  return normalizedName;
}

function buildProfileCohortHavingClause(
  definition: PropertyBasedCohortDefinition
): string | null {
  const { properties, operator } = definition.criteria;

  // Every argMax below must order the candidate rows IDENTICALLY, or
  // equal-version rows with conflicting fields could each win a different
  // column — matching an AND cohort against a synthetic combination no
  // stored row contains. One shared key — the version column, tie-broken by
  // a hash of every referenced column — makes all aggregates pick their
  // value from the same winning row, deterministically. The hash (rather
  // than the raw value tuple) keeps the per-group comparison state at a
  // fixed 8 bytes: measured on 8.8M profiles, the raw-tuple key cost ~40%
  // extra query time while the hashed key is free. A wrong tie-break would
  // need a version tie AND a 64-bit collision between different rows — and
  // even then every aggregate in the query still elects the same row.
  const referencedColumns = Array.from(
    new Set(properties.map((f) => profileColumnAccess(f.name)))
  );
  const latestRowKey = `tuple(last_seen_at, cityHash64(${referencedColumns.join(', ')}))`;

  const filterWhere = getProfileFiltersWhereClause(properties, {
    latestPerProfileKey: latestRowKey,
  });
  const filterClauses = Object.values(filterWhere);

  if (filterClauses.length === 0) {
    return null;
  }

  return filterClauses.join(operator === 'and' ? ' AND ' : ' OR ');
}

export function buildPropertyBasedCohortQuery(
  projectId: string,
  definition: PropertyBasedCohortDefinition,
  limit?: number
): string {
  const havingClause = buildProfileCohortHavingClause(definition);

  if (!havingClause) {
    return `SELECT id as profile_id FROM ${TABLE.profiles} WHERE 1=0`;
  }

  // Resolve each profile's newest row with GROUP BY + argMax instead of
  // FINAL: FINAL cannot spill to disk, so on wide projects the dedup itself
  // is what runs out of memory. The aggregate shape spills normally under
  // PROFILE_COHORT_QUERY_SETTINGS, and filters on aggregates move to HAVING.
  return `
    SELECT id as profile_id
    FROM ${TABLE.profiles}
    WHERE project_id = ${sqlstring.escape(projectId)}
    GROUP BY id
    HAVING (${havingClause})
    ${limit ? `LIMIT ${limit}` : ''}
  `;
}

export async function computeEventBasedCohort(
  projectId: string,
  definition: EventBasedCohortDefinition,
  limit?: number
): Promise<string[]> {
  const { events, operator } = definition.criteria;
  const { chQuery } = await loadChClient();

  const queries = events.map((eventCriteria) =>
    buildEventCriteriaQuery(projectId, eventCriteria)
  );

  const combinedQuery =
    operator === 'and'
      ? queries.join(' INTERSECT ')
      : queries.join(' UNION DISTINCT ');

  const finalQuery = limit ? `${combinedQuery} LIMIT ${limit}` : combinedQuery;

  const results = await chQuery<{ profile_id: string }>(finalQuery);
  return results.map((r) => r.profile_id);
}

export async function countEventBasedCohort(
  projectId: string,
  definition: EventBasedCohortDefinition
): Promise<number> {
  const { events, operator } = definition.criteria;
  const { chQuery } = await loadChClient();

  const queries = events.map((eventCriteria) =>
    buildEventCriteriaQuery(projectId, eventCriteria)
  );

  const combinedQuery =
    operator === 'and'
      ? queries.join(' INTERSECT ')
      : queries.join(' UNION DISTINCT ');

  const countQuery = `SELECT count() as count FROM (${combinedQuery})`;
  const results = await chQuery<{ count: number }>(countQuery);
  return results[0]?.count ?? 0;
}

function getProfileFiltersWhereClause(
  filters: IChartEventFilter[],
  { latestPerProfileKey }: { latestPerProfileKey?: string } = {}
): Record<string, string> {
  const where: Record<string, string> = {};

  filters.forEach((filter, index) => {
    const id = `pf${index}`;
    const { name, value, operator } = filter;

    if (
      value.length === 0 &&
      operator !== 'isNull' &&
      operator !== 'isNotNull'
    ) {
      return;
    }

    let columnAccess = profileColumnAccess(name);

    if (latestPerProfileKey) {
      // Resolve the profile's newest row inside a GROUP BY instead of
      // reading through FINAL. The key is shared by every wrapped column
      // (see buildProfileCohortHavingClause), so all aggregates read the
      // SAME winning row: last_seen_at is the table's version column but is
      // not unique, and per-column tie-breaking would let equal-version
      // rows with conflicting fields produce a synthetic combination no
      // stored row contains. FINAL breaks the same ties by part order,
      // which is not derivable from the data and can shift under a
      // background merge — the shared value-tuple tie-break is
      // deterministic instead.
      columnAccess = `argMax(${columnAccess}, ${latestPerProfileKey})`;
    }

    switch (operator) {
      case 'is': {
        if (value.length === 1) {
          where[id] =
            `${columnAccess} = ${sqlstring.escape(String(value[0]).trim())}`;
        } else {
          where[id] = `${columnAccess} IN (${value
            .map((val) => sqlstring.escape(String(val).trim()))
            .join(', ')})`;
        }
        break;
      }
      case 'isNot': {
        if (value.length === 1) {
          where[id] =
            `${columnAccess} != ${sqlstring.escape(String(value[0]).trim())}`;
        } else {
          where[id] = `${columnAccess} NOT IN (${value
            .map((val) => sqlstring.escape(String(val).trim()))
            .join(', ')})`;
        }
        break;
      }
      case 'contains': {
        where[id] = `(${value
          .map(
            (val) =>
              `${columnAccess} LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
          )
          .join(' OR ')})`;
        break;
      }
      case 'doesNotContain': {
        where[id] = `(${value
          .map(
            (val) =>
              `${columnAccess} NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
          )
          .join(' OR ')})`;
        break;
      }
      case 'startsWith': {
        where[id] = `(${value
          .map(
            (val) =>
              `${columnAccess} LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`
          )
          .join(' OR ')})`;
        break;
      }
      case 'endsWith': {
        where[id] = `(${value
          .map(
            (val) =>
              `${columnAccess} LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`
          )
          .join(' OR ')})`;
        break;
      }
      case 'isNull': {
        where[id] = `(${columnAccess} IS NULL OR ${columnAccess} = '')`;
        break;
      }
      case 'isNotNull': {
        where[id] = `(${columnAccess} IS NOT NULL AND ${columnAccess} != '')`;
        break;
      }
      case 'gt': {
        if (value[0] !== undefined) {
          where[id] = `toFloat64OrNull(${columnAccess}) > ${Number(value[0])}`;
        }
        break;
      }
      case 'lt': {
        if (value[0] !== undefined) {
          where[id] = `toFloat64OrNull(${columnAccess}) < ${Number(value[0])}`;
        }
        break;
      }
      case 'gte': {
        if (value[0] !== undefined) {
          where[id] = `toFloat64OrNull(${columnAccess}) >= ${Number(value[0])}`;
        }
        break;
      }
      case 'lte': {
        if (value[0] !== undefined) {
          where[id] = `toFloat64OrNull(${columnAccess}) <= ${Number(value[0])}`;
        }
        break;
      }
    }
  });

  return where;
}

export async function computePropertyBasedCohort(
  projectId: string,
  definition: PropertyBasedCohortDefinition,
  limit?: number
): Promise<string[]> {
  if (!buildProfileCohortHavingClause(definition)) {
    return [];
  }

  const { chQuery } = await loadChClient();
  const results = await chQuery<{ profile_id: string }>(
    buildPropertyBasedCohortQuery(projectId, definition, limit),
    PROFILE_COHORT_QUERY_SETTINGS
  );
  return results.map((r) => r.profile_id);
}

export async function countPropertyBasedCohort(
  projectId: string,
  definition: PropertyBasedCohortDefinition
): Promise<number> {
  if (!buildProfileCohortHavingClause(definition)) {
    return 0;
  }

  const { chQuery } = await loadChClient();
  const results = await chQuery<{ count: number }>(
    `SELECT count() as count FROM (${buildPropertyBasedCohortQuery(projectId, definition)})`,
    PROFILE_COHORT_QUERY_SETTINGS
  );
  return results[0]?.count ?? 0;
}

export async function storeCohortMembership(
  projectId: string,
  cohortId: string,
  profileIds: string[],
  version: number
): Promise<void> {
  const { ch } = await loadChClient();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (profileIds.length > 0) {
    const data = profileIds.map((profileId) => ({
      project_id: projectId,
      cohort_id: cohortId,
      profile_id: profileId,
      matched_at: now,
      matching_properties: {},
      version,
    }));

    await ch.insert({
      table: TABLE.cohortMembers,
      values: data,
      format: 'JSONEachRow',
    });
  }

  const sampleProfiles = profileIds.slice(0, 10);
  await ch.insert({
    table: TABLE.cohortMetadata,
    values: [
      {
        project_id: projectId,
        cohort_id: cohortId,
        member_count: profileIds.length,
        last_computed_at: now,
        sample_profiles: sampleProfiles,
        version,
      },
    ],
    format: 'JSONEachRow',
  });
}

export async function getCohortMembers(
  cohortId: string,
  projectId: string,
  opts?: { limit?: number; offset?: number }
): Promise<{ profileIds: string[]; total: number }> {
  const db = await loadDb();
  const { chQuery } = await loadChClient();
  const cohort = await db.cohort.findUnique({ where: { id: cohortId } });

  if (!cohort) {
    throw new Error('Cohort not found');
  }

  const query = `
    SELECT
      profile_id,
      count() OVER() as total
    FROM ${TABLE.cohortMembers} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND cohort_id = ${sqlstring.escape(cohortId)}
    ORDER BY matched_at DESC
    ${opts?.limit ? `LIMIT ${opts.limit}` : ''}
    ${opts?.offset ? `OFFSET ${opts.offset}` : ''}
  `;

  const results = await chQuery<{ profile_id: string; total: number }>(query);
  return {
    profileIds: results.map((r) => r.profile_id),
    total: results[0]?.total || 0,
  };
}

const COHORT_COUNT_CACHE_MS = 15 * 60 * 1000;

export async function getCohortCount(
  cohortId: string,
  projectId: string
): Promise<number> {
  const db = await loadDb();
  const cohort = await db.cohort.findUnique({ where: { id: cohortId } });

  if (!cohort) {
    throw new Error('Cohort not found');
  }

  if (cohort.lastComputedAt) {
    const age = Date.now() - cohort.lastComputedAt.getTime();
    if (age < COHORT_COUNT_CACHE_MS) {
      return cohort.profileCount;
    }
  }

  const { chQuery } = await loadChClient();
  const result = await chQuery<{ count: number }>(`
    SELECT count() as count
    FROM ${TABLE.cohortMembers} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND cohort_id = ${sqlstring.escape(cohortId)}
  `);
  return result[0]?.count || 0;
}

export async function computeCohort(
  projectId: string,
  definition: CohortDefinition,
  limit?: number
): Promise<string[]> {
  if (definition.type === 'event') {
    return computeEventBasedCohort(projectId, definition, limit);
  }
  if (definition.type === 'property') {
    return computePropertyBasedCohort(projectId, definition, limit);
  }
  return [];
}

export async function countCohort(
  projectId: string,
  definition: CohortDefinition
): Promise<number> {
  if (definition.type === 'event') {
    return countEventBasedCohort(projectId, definition);
  }
  if (definition.type === 'property') {
    return countPropertyBasedCohort(projectId, definition);
  }
  return 0;
}

export async function updateCohortMembership(cohortId: string): Promise<void> {
  const db = await loadDb();
  const { ch, getReplicatedTableName } = await loadChClient();
  const cohort = await db.cohort.findUnique({ where: { id: cohortId } });

  if (!cohort) {
    return;
  }

  const definition = cohort.definition as CohortDefinition;
  const profileIds = await computeCohort(
    cohort.projectId,
    definition,
    COHORT_MATERIALIZE_LIMIT
  );

  const version = Date.now();

  // ReplacingMergeTree only dedupes within the same ORDER BY key
  // (project_id, cohort_id, profile_id), so profiles that fell out of the
  // cohort definition would otherwise linger forever. Clear them first.
  await ch.command({
    query: `DELETE FROM ${getReplicatedTableName(TABLE.cohortMembers)} WHERE cohort_id = ${sqlstring.escape(cohort.id)} AND project_id = ${sqlstring.escape(cohort.projectId)}`,
    clickhouse_settings: {
      lightweight_deletes_sync: '1',
    },
  });

  await storeCohortMembership(cohort.projectId, cohort.id, profileIds, version);

  await db.cohort.update({
    where: { id: cohortId },
    data: {
      profileCount: profileIds.length,
      lastComputedAt: new Date(),
    },
  });
}

export async function deleteCohortMembership(
  cohortId: string,
  projectId: string
): Promise<void> {
  const { ch, getReplicatedTableName } = await loadChClient();
  const where = `cohort_id = ${sqlstring.escape(cohortId)} AND project_id = ${sqlstring.escape(projectId)}`;
  for (const table of [TABLE.cohortMembers, TABLE.cohortMetadata]) {
    await ch.command({
      query: `DELETE FROM ${getReplicatedTableName(table)} WHERE ${where}`,
      clickhouse_settings: {
        lightweight_deletes_sync: '0',
      },
    });
  }
}

export async function getProfilesInCohort(
  cohortId: string,
  projectId: string
): Promise<Set<string>> {
  const { profileIds } = await getCohortMembers(cohortId, projectId, {
    limit: 100_000,
  });
  return new Set(profileIds);
}

/** Every non-static cohort id, for the cohortRefresh cron fragment's fan-out. */
export async function listRefreshableCohortIds(): Promise<string[]> {
  const db = await loadDb();
  const cohorts = await db.cohort.findMany({
    where: { isStatic: false },
    select: { id: true },
  });
  return cohorts.map((c) => c.id);
}

export async function listCohortMemberProfiles({
  projectId,
  cohortId,
  cursor,
  take,
  search,
  filters,
}: {
  projectId: string;
  cohortId: string;
  cursor?: number;
  take: number;
  search?: string;
  filters?: IChartEventFilter[];
}): Promise<{ data: IServiceProfile[]; count: number }> {
  const { chQuery } = await loadChClient();
  const { buildFilterWhere } = await import('../chart/src/table-filter-where');
  const { profileSearchSql } = await import('../profile/profile.service');
  // M10-005: `getProfiles` takes `ServiceDeps` now and this function has none
  // — packages/trpc's cohort router still calls it bare — so it reaches the
  // v1-compat spelling. Converting this module is its own task.
  const { getProfiles } = await import('../../v1-compat');

  const offset = Math.max(0, (cursor ?? 0) * take);
  const searchClause = profileSearchSql(search);
  const searchCondition = searchClause ? `AND ${searchClause}` : '';

  const extraConditions = filters?.length
    ? Object.values(
        buildFilterWhere(filters, projectId, {
          selfTable: 'profiles',
          profileIdExpr: 'id',
          groupsExpr: 'groups',
        })
      )
    : [];
  const extraConditionSql = extraConditions.length
    ? `AND ${extraConditions.join(' AND ')}`
    : '';

  const rows = await chQuery<{ id: string; total_count: number }>(`
    SELECT id, count() OVER () AS total_count
    FROM ${TABLE.profiles} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND id IN (
        SELECT profile_id FROM ${TABLE.cohortMembers} FINAL
        WHERE cohort_id = ${sqlstring.escape(cohortId)}
          AND project_id = ${sqlstring.escape(projectId)}
      )
      ${searchCondition}
      ${extraConditionSql}
    ORDER BY created_at DESC
    LIMIT ${take} OFFSET ${offset}
  `);

  const count = rows[0]?.total_count ?? 0;
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    return { data: [], count };
  }

  const profiles = await getProfiles(ids, projectId);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const data = ids
    .map((id) => byId.get(id))
    .filter(Boolean) as IServiceProfile[];
  return { data, count };
}

export async function getCohortMemberEvents(
  projectId: string,
  cohortId: string,
  limit = 10
): Promise<{ name: string; count: number }[]> {
  const { chQuery } = await loadChClient();
  return chQuery<{ name: string; count: number }>(`
    SELECT name, count() AS count
    FROM ${TABLE.events}
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND profile_id IN (
        SELECT profile_id FROM ${TABLE.cohortMembers} FINAL
        WHERE cohort_id = ${sqlstring.escape(cohortId)}
          AND project_id = ${sqlstring.escape(projectId)}
      )
      AND name NOT IN ('screen_view', 'session_start', 'session_end')
    GROUP BY name
    ORDER BY count DESC
    LIMIT ${limit}
  `);
}

export async function getCohortEventsPerDay(
  projectId: string,
  cohortId: string,
  days = 30
): Promise<{ date: string; count: number }[]> {
  const { chQuery } = await loadChClient();
  const rows = await chQuery<{ date: string; count: number }>(`
    SELECT
      toDate(created_at) AS date,
      count() AS count
    FROM ${TABLE.events}
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND created_at >= toDate(now() - INTERVAL ${days} DAY)
      AND profile_id IN (
        SELECT profile_id FROM ${TABLE.cohortMembers} FINAL
        WHERE cohort_id = ${sqlstring.escape(cohortId)}
          AND project_id = ${sqlstring.escape(projectId)}
      )
    GROUP BY date
    ORDER BY date ASC
    WITH FILL
      FROM toDate(now() - INTERVAL ${days} DAY)
      TO toDate(now() + INTERVAL 1 DAY)
      STEP INTERVAL 1 DAY
  `);
  return rows.map((r) => ({ date: String(r.date), count: Number(r.count) }));
}

export async function getCohortMemberRoutes(
  projectId: string,
  cohortId: string,
  limit = 10
): Promise<{ path: string; count: number }[]> {
  const { chQuery } = await loadChClient();
  return chQuery<{ path: string; count: number }>(`
    SELECT path, count() AS count
    FROM ${TABLE.events}
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND profile_id IN (
        SELECT profile_id FROM ${TABLE.cohortMembers} FINAL
        WHERE cohort_id = ${sqlstring.escape(cohortId)}
          AND project_id = ${sqlstring.escape(projectId)}
      )
      AND name = 'screen_view'
      AND path != ''
    GROUP BY path
    ORDER BY count DESC
    LIMIT ${limit}
  `);
}

export interface CohortService {
  updateMembership(cohortId: string): Promise<void>;
  listRefreshableCohortIds(): Promise<string[]>;
  /**
   * Enqueue a recompute for a cohort.
   *
   * Uses `deduplicationId` rather than `jobId`. A fixed jobId makes BullMQ
   * short-circuit `add` for as long as *any* record for that id exists in
   * Redis — and `removeOnComplete: { age }` is not a TTL, it only trims on
   * some other job in the queue finishing. That deadlocks: nothing can be
   * added because the completed record is still there, and the record is
   * never collected because nothing gets added. `deduplicationId`, in
   * contrast, is released by `moveToFinished` on both completion and
   * terminal failure, so it only collapses a compute that is genuinely still
   * in flight (ADR-005: "cohort must NOT be normalised onto jobId").
   */
  enqueueCompute(cohortId: string): Promise<void>;
}

export function createCohortService(deps: ServiceDeps): CohortService {
  return {
    updateMembership: updateCohortMembership,
    listRefreshableCohortIds,
    enqueueCompute: async (cohortId) => {
      await deps.queues.cohortCompute.cohortCompute.add(
        { cohortId },
        { deduplicationId: `cohort-${cohortId}` }
      );
    },
  };
}
