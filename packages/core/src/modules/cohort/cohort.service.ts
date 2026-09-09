// Moved from packages/db/src/services/cohort.service.ts (M5-003). The
// producer wrapper (`enqueueCohortCompute`) moves here too — db cannot hold
// producers (ADR-007's discovery: "packages/db/src/services/cohort.service.ts:12
// imports cohortComputeQueue from @openpanel/queue" was flagged as reaching
// back into infrastructure it should not know about; @openpanel/queue itself
// was deleted at M11-004). packages/db lost this file entirely: nothing
// outside the now-deleted trpc/worker and this module's own tests reached it
// through @openpanel/db's barrel.
//
// db/ch access is LAZY (`load*` below), not a static top-level import — see
// insight.service.ts's header for the full reasoning (jobs.registry.ts and
// services.ts pull this module into the eager barrel chain nearly every core
// test file reaches, and constructing @openpanel/db's clients at import time
// would spawn a pino-pretty transport worker thread per test file).
//
// M12-004 converted every ClickHouse statement here onto the ADR-013 `sql`
// tag: values bind as `{pN:Type}` params, identifiers go through `sql.id`,
// structure composes with `sql.join`. `sqlstring` is gone from this module.
// The proof (V1 vs V2 result sets, per branch, against local ClickHouse) is
// `cohort.sql.proof.md` beside this file. Table names are
// a local literal map (`TABLE`, below), not @openpanel/db's `TABLE_NAMES`: the
// latter lives in the same module as `ch`/`chQuery` (clickhouse/client.ts,
// which constructs a real pino logger at import time — the exact cost the lazy
// loads elsewhere in this file exist to defer), and this module's SQL builders
// are pure sync functions the P2 SQL-shape tests call with no ClickHouse
// connection at all.
//
// V1's trpc router (packages/trpc/src/routers/cohort.ts) and worker cron job
// (apps/worker/src/jobs/cron.cohort-refresh.ts) used to stay live (DELEGATE
// PATTERN) and enqueue by calling @openpanel/queue's cohortComputeQueue
// directly, same as gsc's V1 router/worker did for gscQueue (M5-002) —
// @openpanel/queue itself imported @openpanel/core for its logger, so core
// could not import @openpanel/queue back without a real package cycle. Both
// delegates are gone now (apps/worker at P9, packages/trpc/packages/queue at
// M11-004). `CohortService.enqueueCompute` (below) is the canonical,
// ctx.queues-based wrapper for callers that already have a Ctx (this
// module's own rpc mutations and its cron fragment).

import type { ClickHouseSettings } from '@clickhouse/client';
import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import type { CoreConfig } from '../../config';
import type { ServiceDeps, Services } from '../../services';
import { chQuery } from '../../shared/ch-query';
import type { IServiceProfile } from '../profile/profile.service';
import type { IChartEventFilter } from '../report/report.constants';
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

/**
 * The mutation target for a table: `<name>_replicated ON CLUSTER '{cluster}'`
 * when clustered, the plain name otherwise — the exact text
 * `getReplicatedTableName` produces (asserted in src/cohort-sql.test.ts).
 *
 * Built here rather than fed through `sql.id` because the clustered form is
 * not an identifier. The `ON CLUSTER` clause is literal template text, and
 * `'{cluster}'` is a ClickHouse *macro*, not a `{name:Type}` placeholder — it
 * carries no type suffix, so parameter substitution leaves it alone.
 */
export function replicatedTarget(
  clustered: boolean,
  tableName: string
): SqlFragment {
  if (clustered) {
    return sql`${sql.id(`${tableName}_replicated`)} ON CLUSTER '{cluster}'`;
  }
  return sql.id(tableName);
}

// Max members materialized into cohort_members per compute. Cohorts larger
// than this are silently truncated to an arbitrary subset, so deployments
// with bigger cohorts need to raise it — env-tunable to avoid an image
// rebuild for what is really a sizing knob.
//
// Strictly a positive safe integer, which is what the config loader's
// `optionalPositiveInt` guarantees: '5000junk', '-1' and '0' all arrive as
// undefined, and 0 is falsy at the `limit ? LIMIT ... : ''` call sites, which
// would silently remove the cap entirely.
const DEFAULT_COHORT_MATERIALIZE_LIMIT = 10_000;

export function cohortMaterializeLimit(config: CoreConfig): number {
  return (
    config.query.cohortMaterializeLimit ?? DEFAULT_COHORT_MATERIALIZE_LIMIT
  );
}

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
// A standalone function of its two parsed inputs (not a module-level read),
// so a test can exercise every branch by calling it directly — bun:test
// shares one module registry per file even under --isolate, so vitest's
// vi.resetModules()-per-case porting has no equivalent (see AGENTS.md; this
// was the one vi.resetModules site in the suite, ADR-010's tail table).
export function deriveCohortQuerySettings({
  memoryLimitBytes,
  spillBytes: spillBytesParsed,
}: {
  memoryLimitBytes: number | undefined;
  spillBytes: number | undefined;
}): ClickHouseSettings {
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

export function profileCohortQuerySettings(
  config: CoreConfig
): ClickHouseSettings {
  return deriveCohortQuerySettings({
    memoryLimitBytes: config.query.cohortQueryMemoryLimitBytes,
    spillBytes: config.query.cohortQuerySpillBytes,
  });
}

// The column is a parameter rather than a post-hoc `.replace('created_at',
// 'event_date')` on finished text: V1 rewrote the clause that way at all four
// call sites below, and a fragment has no text to rewrite.
function buildTimeConstraint(
  timeframe: Timeframe,
  column: SqlFragment
): SqlFragment {
  if (timeframe.type === 'relative') {
    const match = timeframe.value.match(/^(\d+)d$/);
    if (!match) {
      throw new Error(`Invalid relative timeframe: ${timeframe.value}`);
    }
    const days = Number.parseInt(match[1]!, 10);
    return sql`${column} >= toDate(now() - INTERVAL ${sql.uint64(days)} DAY)`;
  }

  const start = timeframe.start;
  if (timeframe.end) {
    return sql`${column} BETWEEN toDate(${sql.string(start)}) AND toDate(${sql.string(timeframe.end)})`;
  }
  return sql`${column} >= toDate(${sql.string(start)})`;
}

function getFrequencyOperator(frequency: Frequency): SqlFragment {
  const count = sql.uint64(frequency.count);
  switch (frequency.operator) {
    case 'gte':
      return sql`>= ${count}`;
    case 'eq':
      return sql`= ${count}`;
    case 'lte':
      return sql`<= ${count}`;
    default:
      return sql`>= ${count}`;
  }
}

/** The trimmed string form V1 escaped for every filter comparand. */
function trimmedComparand(value: unknown): string {
  return String(value).trim();
}

// One event-property filter. Values bind; the property key is a Map key, so it
// binds as a value too. An `IN`/`NOT IN` list becomes one `Array(String)`
// param — V1's `IN ()` on an empty list and `IN {p:Array(String)}` on an empty
// array both match nothing (SQL_MIGRATION_RECIPE idioms 9/10).
function eventPropertyCondition(filter: IChartEventFilter): SqlFragment {
  const propertyKey = sql.string(filter.name.replace('properties.', ''));
  const { value, operator } = filter;
  const list = sql.array('String', value.map(trimmedComparand));

  switch (operator) {
    case 'is':
      if (value.length === 1) {
        return sql`(property_key = ${propertyKey} AND property_value = ${sql.string(trimmedComparand(value[0]))})`;
      }
      return sql`(property_key = ${propertyKey} AND property_value IN ${list})`;
    case 'isNot':
      if (value.length === 1) {
        return sql`(property_key = ${propertyKey} AND property_value != ${sql.string(trimmedComparand(value[0]))})`;
      }
      return sql`(property_key = ${propertyKey} AND property_value NOT IN ${list})`;
    case 'contains':
      return sql`(property_key = ${propertyKey} AND (${sql.join(
        value.map(
          (val) =>
            sql`property_value LIKE ${sql.string(`%${trimmedComparand(val)}%`)}`
        ),
        ' OR '
      )}))`;
    case 'doesNotContain':
      return sql`(property_key = ${propertyKey} AND (${sql.join(
        value.map(
          (val) =>
            sql`property_value NOT LIKE ${sql.string(`%${trimmedComparand(val)}%`)}`
        ),
        ' AND '
      )}))`;
    default:
      return sql`(property_key = ${propertyKey} AND property_value IN ${list})`;
  }
}

export function buildEventCriteriaQuery(
  projectId: string,
  criteria: EventCriteria
): SqlFragment {
  const { name, filters, timeframe, frequency } = criteria;
  const timeConstraint = buildTimeConstraint(timeframe, sql.id('event_date'));
  const project = sql.string(projectId);
  const eventName = sql.string(name);
  const hasEventPropertyFilters = filters.some(
    (f) =>
      f.name.startsWith('properties.') &&
      !f.name.startsWith('profile.properties.')
  );

  if (hasEventPropertyFilters) {
    const propertyConditions = sql.join(
      filters
        .filter((f) => f.name.startsWith('properties.'))
        .map(eventPropertyCondition),
      ' OR '
    );

    if (frequency) {
      const frequencyOp = getFrequencyOperator(frequency);
      return sql`
        SELECT profile_id
        FROM ${sql.id(TABLE.eventPropertyProfileSummaryMv)}
        WHERE project_id = ${project}
          AND name = ${eventName}
          AND ${timeConstraint}
          AND (${propertyConditions})
        GROUP BY profile_id
        HAVING countMerge(event_count) ${frequencyOp}
      `;
    }

    return sql`
      SELECT DISTINCT profile_id
      FROM ${sql.id(TABLE.eventPropertyProfileSummaryMv)}
      WHERE project_id = ${project}
        AND name = ${eventName}
        AND ${timeConstraint}
        AND (${propertyConditions})
    `;
  }

  if (frequency) {
    const frequencyOp = getFrequencyOperator(frequency);
    return sql`
      SELECT profile_id
      FROM ${sql.id(TABLE.eventProfileSummaryMv)}
      WHERE project_id = ${project}
        AND name = ${eventName}
        AND ${timeConstraint}
      GROUP BY profile_id
      HAVING countMerge(event_count) ${frequencyOp}
    `;
  }

  return sql`
    SELECT DISTINCT profile_id
    FROM ${sql.id(TABLE.eventProfileSummaryMv)}
    WHERE project_id = ${project}
      AND name = ${eventName}
      AND ${timeConstraint}
  `;
}

// `profile.<x>` and `profiles.<x>` name the same column; normalizing first
// makes the dedup in buildProfileCohortHavingClause see them as one.
function normalizeProfileColumn(name: string): string {
  return name.replace(/^profile\./, 'profiles.');
}

// SQL for a profile filter's column: either a properties Map lookup or a
// plain column, qualified with the table name. Cohort definitions come from
// the API, so both halves are user-controlled: the Map key is a *value* and
// binds as one, and the plain column goes through `sql.id`, which throws
// rather than inlining anything that is not a bare (once-qualified)
// identifier (ADR-013 R3). V1 inlined it verbatim — the one input class whose
// behaviour changes is a non-identifier column name, which V1 turned into a
// ClickHouse `UNKNOWN_IDENTIFIER` and V2 rejects before the round trip.
function profileColumnAccess(normalizedName: string): SqlFragment {
  if (normalizedName.startsWith('profiles.properties.')) {
    const propKey = normalizedName.replace('profiles.properties.', '');
    return sql`profiles.properties[${sql.string(propKey)}]`;
  }
  return sql.id(normalizedName);
}

function buildProfileCohortHavingClause(
  definition: PropertyBasedCohortDefinition
): SqlFragment | null {
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
    new Set(properties.map((f) => normalizeProfileColumn(f.name)))
  ).map(profileColumnAccess);
  const latestRowKey = sql`tuple(last_seen_at, cityHash64(${sql.join(referencedColumns)}))`;

  const filterWhere = getProfileFiltersWhereClause(properties, {
    latestPerProfileKey: latestRowKey,
  });
  const filterClauses = Object.values(filterWhere);

  if (filterClauses.length === 0) {
    return null;
  }

  return sql.join(filterClauses, operator === 'and' ? ' AND ' : ' OR ');
}

export function buildPropertyBasedCohortQuery(
  projectId: string,
  definition: PropertyBasedCohortDefinition,
  limit?: number
): SqlFragment {
  const havingClause = buildProfileCohortHavingClause(definition);

  if (!havingClause) {
    return sql`SELECT id as profile_id FROM ${sql.id(TABLE.profiles)} WHERE 1=0`;
  }

  // Resolve each profile's newest row with GROUP BY + argMax instead of
  // FINAL: FINAL cannot spill to disk, so on wide projects the dedup itself
  // is what runs out of memory. The aggregate shape spills normally under
  // profileCohortQuerySettings, and filters on aggregates move to HAVING.
  return sql`
    SELECT id as profile_id
    FROM ${sql.id(TABLE.profiles)}
    WHERE project_id = ${sql.string(projectId)}
    GROUP BY id
    HAVING (${havingClause})
    ${limit ? sql`LIMIT ${sql.uint64(limit)}` : sql.empty}
  `;
}

// `INTERSECT` / `UNION DISTINCT` are not `sql.join` separators (that set is
// closed on purpose), so the criteria fold left — the same associativity
// `queries.join(' INTERSECT ')` produced.
function combineCriteriaQueries(
  queries: SqlFragment[],
  operator: 'and' | 'or'
): SqlFragment {
  if (queries.length === 0) {
    return sql.empty;
  }
  return queries.reduce((left, right) =>
    operator === 'and'
      ? sql`${left} INTERSECT ${right}`
      : sql`${left} UNION DISTINCT ${right}`
  );
}

export async function computeEventBasedCohort(
  deps: ServiceDeps,
  projectId: string,
  definition: EventBasedCohortDefinition,
  limit?: number
): Promise<string[]> {
  const { events, operator } = definition.criteria;

  const queries = events.map((eventCriteria) =>
    buildEventCriteriaQuery(projectId, eventCriteria)
  );

  const combinedQuery = combineCriteriaQueries(queries, operator);

  const finalQuery = limit
    ? sql`${combinedQuery} LIMIT ${sql.uint64(limit)}`
    : combinedQuery;

  const results = await chQuery<{ profile_id: string }>(deps, finalQuery);
  return results.map((r) => r.profile_id);
}

export async function countEventBasedCohort(
  deps: ServiceDeps,
  projectId: string,
  definition: EventBasedCohortDefinition
): Promise<number> {
  const { events, operator } = definition.criteria;

  const queries = events.map((eventCriteria) =>
    buildEventCriteriaQuery(projectId, eventCriteria)
  );

  const combinedQuery = combineCriteriaQueries(queries, operator);

  const countQuery = sql`SELECT count() as count FROM (${combinedQuery})`;
  const results = await chQuery<{ count: number }>(deps, countQuery);
  return results[0]?.count ?? 0;
}

function getProfileFiltersWhereClause(
  filters: IChartEventFilter[],
  { latestPerProfileKey }: { latestPerProfileKey?: SqlFragment } = {}
): Record<string, SqlFragment> {
  const where: Record<string, SqlFragment> = {};

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

    let columnAccess = profileColumnAccess(normalizeProfileColumn(name));

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
      columnAccess = sql`argMax(${columnAccess}, ${latestPerProfileKey})`;
    }

    switch (operator) {
      case 'is': {
        if (value.length === 1) {
          where[id] =
            sql`${columnAccess} = ${sql.string(trimmedComparand(value[0]))}`;
        } else {
          where[id] =
            sql`${columnAccess} IN ${sql.array('String', value.map(trimmedComparand))}`;
        }
        break;
      }
      case 'isNot': {
        if (value.length === 1) {
          where[id] =
            sql`${columnAccess} != ${sql.string(trimmedComparand(value[0]))}`;
        } else {
          where[id] =
            sql`${columnAccess} NOT IN ${sql.array('String', value.map(trimmedComparand))}`;
        }
        break;
      }
      case 'contains': {
        where[id] = sql`(${sql.join(
          value.map(
            (val) =>
              sql`${columnAccess} LIKE ${sql.string(`%${trimmedComparand(val)}%`)}`
          ),
          ' OR '
        )})`;
        break;
      }
      case 'doesNotContain': {
        where[id] = sql`(${sql.join(
          value.map(
            (val) =>
              sql`${columnAccess} NOT LIKE ${sql.string(`%${trimmedComparand(val)}%`)}`
          ),
          ' OR '
        )})`;
        break;
      }
      case 'startsWith': {
        where[id] = sql`(${sql.join(
          value.map(
            (val) =>
              sql`${columnAccess} LIKE ${sql.string(`${trimmedComparand(val)}%`)}`
          ),
          ' OR '
        )})`;
        break;
      }
      case 'endsWith': {
        where[id] = sql`(${sql.join(
          value.map(
            (val) =>
              sql`${columnAccess} LIKE ${sql.string(`%${trimmedComparand(val)}`)}`
          ),
          ' OR '
        )})`;
        break;
      }
      case 'isNull': {
        where[id] = sql`(${columnAccess} IS NULL OR ${columnAccess} = '')`;
        break;
      }
      case 'isNotNull': {
        where[id] =
          sql`(${columnAccess} IS NOT NULL AND ${columnAccess} != '')`;
        break;
      }
      case 'gt': {
        if (value[0] !== undefined) {
          where[id] =
            sql`toFloat64OrNull(${columnAccess}) > ${sql.float64(Number(value[0]))}`;
        }
        break;
      }
      case 'lt': {
        if (value[0] !== undefined) {
          where[id] =
            sql`toFloat64OrNull(${columnAccess}) < ${sql.float64(Number(value[0]))}`;
        }
        break;
      }
      case 'gte': {
        if (value[0] !== undefined) {
          where[id] =
            sql`toFloat64OrNull(${columnAccess}) >= ${sql.float64(Number(value[0]))}`;
        }
        break;
      }
      case 'lte': {
        if (value[0] !== undefined) {
          where[id] =
            sql`toFloat64OrNull(${columnAccess}) <= ${sql.float64(Number(value[0]))}`;
        }
        break;
      }
    }
  });

  return where;
}

export async function computePropertyBasedCohort(
  deps: ServiceDeps,
  projectId: string,
  definition: PropertyBasedCohortDefinition,
  limit?: number
): Promise<string[]> {
  if (!buildProfileCohortHavingClause(definition)) {
    return [];
  }

  const results = await chQuery<{ profile_id: string }>(
    deps,

    buildPropertyBasedCohortQuery(projectId, definition, limit),
    profileCohortQuerySettings(deps.config)
  );
  return results.map((r) => r.profile_id);
}

export async function countPropertyBasedCohort(
  deps: ServiceDeps,
  projectId: string,
  definition: PropertyBasedCohortDefinition
): Promise<number> {
  if (!buildProfileCohortHavingClause(definition)) {
    return 0;
  }

  const results = await chQuery<{ count: number }>(
    deps,

    sql`SELECT count() as count FROM (${buildPropertyBasedCohortQuery(projectId, definition)})`,
    profileCohortQuerySettings(deps.config)
  );
  return results[0]?.count ?? 0;
}

export async function storeCohortMembership(
  deps: ServiceDeps,
  projectId: string,
  cohortId: string,
  profileIds: string[],
  version: number
): Promise<void> {
  const ch = deps.ch;
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
  deps: ServiceDeps,
  cohortId: string,
  projectId: string,
  opts?: { limit?: number; offset?: number }
): Promise<{ profileIds: string[]; total: number }> {
  const db = deps.db;
  const cohort = await db.cohort.findUnique({ where: { id: cohortId } });

  if (!cohort) {
    throw new Error('Cohort not found');
  }

  const query = sql`
    SELECT
      profile_id,
      count() OVER() as total
    FROM ${sql.id(TABLE.cohortMembers)} FINAL
    WHERE project_id = ${sql.string(projectId)}
      AND cohort_id = ${sql.string(cohortId)}
    ORDER BY matched_at DESC
    ${opts?.limit ? sql`LIMIT ${sql.uint64(opts.limit)}` : sql.empty}
    ${opts?.offset ? sql`OFFSET ${sql.uint64(opts.offset)}` : sql.empty}
  `;

  const results = await chQuery<{ profile_id: string; total: number }>(
    deps,
    query
  );
  return {
    profileIds: results.map((r) => r.profile_id),
    total: results[0]?.total || 0,
  };
}

const COHORT_COUNT_CACHE_MS = 15 * 60 * 1000;

export async function getCohortCount(
  deps: ServiceDeps,
  cohortId: string,
  projectId: string
): Promise<number> {
  const db = deps.db;
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

  const result = await chQuery<{ count: number }>(
    deps,
    sql`
    SELECT count() as count
    FROM ${sql.id(TABLE.cohortMembers)} FINAL
    WHERE project_id = ${sql.string(projectId)}
      AND cohort_id = ${sql.string(cohortId)}
  `
  );
  return result[0]?.count || 0;
}

export async function computeCohort(
  deps: ServiceDeps,
  projectId: string,
  definition: CohortDefinition,
  limit?: number
): Promise<string[]> {
  if (definition.type === 'event') {
    return computeEventBasedCohort(deps, projectId, definition, limit);
  }
  if (definition.type === 'property') {
    return computePropertyBasedCohort(deps, projectId, definition, limit);
  }
  return [];
}

export async function countCohort(
  deps: ServiceDeps,
  projectId: string,
  definition: CohortDefinition
): Promise<number> {
  if (definition.type === 'event') {
    return countEventBasedCohort(deps, projectId, definition);
  }
  if (definition.type === 'property') {
    return countPropertyBasedCohort(deps, projectId, definition);
  }
  return 0;
}

export async function updateCohortMembership(
  deps: ServiceDeps,
  cohortId: string
): Promise<void> {
  const db = deps.db;
  const ch = deps.ch;
  const cohort = await db.cohort.findUnique({ where: { id: cohortId } });

  if (!cohort) {
    return;
  }

  const definition = cohort.definition as CohortDefinition;
  const profileIds = await computeCohort(
    deps,
    cohort.projectId,
    definition,
    cohortMaterializeLimit(deps.config)
  );

  const version = Date.now();

  // ReplacingMergeTree only dedupes within the same ORDER BY key
  // (project_id, cohort_id, profile_id), so profiles that fell out of the
  // cohort definition would otherwise linger forever. Clear them first.
  await ch.command({
    ...sql`DELETE FROM ${replicatedTarget(deps.config.clickhouseClustered, TABLE.cohortMembers)} WHERE cohort_id = ${sql.string(cohort.id)} AND project_id = ${sql.string(cohort.projectId)}`.toStatement(),
    clickhouse_settings: {
      lightweight_deletes_sync: '1',
    },
  });

  await storeCohortMembership(
    deps,
    cohort.projectId,
    cohort.id,
    profileIds,
    version
  );

  await db.cohort.update({
    where: { id: cohortId },
    data: {
      profileCount: profileIds.length,
      lastComputedAt: new Date(),
    },
  });
}

export async function deleteCohortMembership(
  deps: ServiceDeps,
  cohortId: string,
  projectId: string
): Promise<void> {
  const ch = deps.ch;
  const where = sql`cohort_id = ${sql.string(cohortId)} AND project_id = ${sql.string(projectId)}`;
  for (const table of [TABLE.cohortMembers, TABLE.cohortMetadata]) {
    await ch.command({
      ...sql`DELETE FROM ${replicatedTarget(deps.config.clickhouseClustered, table)} WHERE ${where}`.toStatement(),
      clickhouse_settings: {
        lightweight_deletes_sync: '0',
      },
    });
  }
}

export async function getProfilesInCohort(
  deps: ServiceDeps,
  cohortId: string,
  projectId: string
): Promise<Set<string>> {
  const { profileIds } = await getCohortMembers(deps, cohortId, projectId, {
    limit: 100_000,
  });
  return new Set(profileIds);
}

/** Every non-static cohort id, for the cohortRefresh cron fragment's fan-out. */
export async function listRefreshableCohortIds(
  deps: ServiceDeps
): Promise<string[]> {
  const db = deps.db;
  const cohorts = await db.cohort.findMany({
    where: { isStatic: false },
    select: { id: true },
  });
  return cohorts.map((c) => c.id);
}

export async function listCohortMemberProfiles(
  deps: ServiceDeps,
  {
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
  }
): Promise<{ data: IServiceProfile[]; count: number }> {
  const { buildFilterWhere } = await import('../chart/src/table-filter-where');
  const { getProfiles, profileSearchCondition } = await import(
    '../profile/profile.service'
  );

  const offset = Math.max(0, (cursor ?? 0) * take);
  const searchClause = profileSearchCondition(search);
  const searchCondition = searchClause ? sql`AND ${searchClause}` : sql.empty;

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
    ? sql`AND ${sql.join(extraConditions, ' AND ')}`
    : sql.empty;

  // M12-003: converted with `buildFilterWhere`, which now returns fragments.
  // V1's plain `IN (subquery)` on the Distributed `cohort_members` is kept as
  // written (docs/ENVIRONMENT.md).
  const rows = await chQuery<{ id: string; total_count: number }>(
    deps,
    sql`
    SELECT id, count() OVER () AS total_count
    FROM ${sql.id(TABLE.profiles)} FINAL
    WHERE project_id = ${sql.string(projectId)}
      AND id IN (
        SELECT profile_id FROM ${sql.id(TABLE.cohortMembers)} FINAL
        WHERE cohort_id = ${sql.string(cohortId)}
          AND project_id = ${sql.string(projectId)}
      )
      ${searchCondition}
      ${extraConditionSql}
    ORDER BY created_at DESC
    LIMIT ${sql.uint64(take)} OFFSET ${sql.uint64(offset)}
  `
  );

  const count = rows[0]?.total_count ?? 0;
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    return { data: [], count };
  }

  const profiles = await getProfiles(deps, ids, projectId);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const data = ids
    .map((id) => byId.get(id))
    .filter(Boolean) as IServiceProfile[];
  return { data, count };
}

export async function getCohortMemberEvents(
  deps: ServiceDeps,
  projectId: string,
  cohortId: string,
  limit = 10
): Promise<{ name: string; count: number }[]> {
  // V1's plain `IN (subquery)` on the Distributed `cohort_members` is kept as
  // written — a conversion changes the binding of values and nothing about the
  // distribution semantics (docs/ENVIRONMENT.md).
  return chQuery<{ name: string; count: number }>(
    deps,
    sql`
    SELECT name, count() AS count
    FROM ${sql.id(TABLE.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND profile_id IN (
        SELECT profile_id FROM ${sql.id(TABLE.cohortMembers)} FINAL
        WHERE cohort_id = ${sql.string(cohortId)}
          AND project_id = ${sql.string(projectId)}
      )
      AND name NOT IN ('screen_view', 'session_start', 'session_end')
    GROUP BY name
    ORDER BY count DESC
    LIMIT ${sql.uint64(limit)}
  `
  );
}

export async function getCohortEventsPerDay(
  deps: ServiceDeps,
  projectId: string,
  cohortId: string,
  days = 30
): Promise<{ date: string; count: number }[]> {
  // `IN (subquery)` on the Distributed `cohort_members`: kept as V1 wrote it.
  const lookbackDays = sql.uint64(days);
  const rows = await chQuery<{ date: string; count: number }>(
    deps,
    sql`
    SELECT
      toDate(created_at) AS date,
      count() AS count
    FROM ${sql.id(TABLE.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND created_at >= toDate(now() - INTERVAL ${lookbackDays} DAY)
      AND profile_id IN (
        SELECT profile_id FROM ${sql.id(TABLE.cohortMembers)} FINAL
        WHERE cohort_id = ${sql.string(cohortId)}
          AND project_id = ${sql.string(projectId)}
      )
    GROUP BY date
    ORDER BY date ASC
    WITH FILL
      FROM toDate(now() - INTERVAL ${lookbackDays} DAY)
      TO toDate(now() + INTERVAL 1 DAY)
      STEP INTERVAL 1 DAY
  `
  );
  return rows.map((r) => ({ date: String(r.date), count: Number(r.count) }));
}

export async function getCohortMemberRoutes(
  deps: ServiceDeps,
  projectId: string,
  cohortId: string,
  limit = 10
): Promise<{ path: string; count: number }[]> {
  // `IN (subquery)` on the Distributed `cohort_members`: kept as V1 wrote it.
  return chQuery<{ path: string; count: number }>(
    deps,
    sql`
    SELECT path, count() AS count
    FROM ${sql.id(TABLE.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND profile_id IN (
        SELECT profile_id FROM ${sql.id(TABLE.cohortMembers)} FINAL
        WHERE cohort_id = ${sql.string(cohortId)}
          AND project_id = ${sql.string(projectId)}
      )
      AND name = 'screen_view'
      AND path != ''
    GROUP BY path
    ORDER BY count DESC
    LIMIT ${sql.uint64(limit)}
  `
  );
}

export function createCohortService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    updateMembership: (cohortId: string): Promise<void> =>
      updateCohortMembership(deps, cohortId),
    listRefreshableCohortIds: (): Promise<string[]> =>
      listRefreshableCohortIds(deps),
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
    enqueueCompute: async (cohortId: string): Promise<void> => {
      await deps.queues.cohortCompute.cohortCompute.add(
        { cohortId },
        { deduplicationId: `cohort-${cohortId}` }
      );
    },
  };
}
