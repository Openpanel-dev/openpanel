// Cohort definitions, membership computation and the compute enqueue.
//
// Table names are a local literal map (`TABLE`) rather than @openpanel/db's
// `TABLE_NAMES`: importing that builds a pino logger, and the SQL builders here
// are pure functions the shape tests call without a ClickHouse connection.

import type { ClickHouseSettings } from '@clickhouse/client';
import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import { chQuery } from '../../ch-query';
import type { CoreConfig } from '../../config';
import type { ServiceDeps, Services } from '../../services';
import { formatClickhouseDate } from '../../shared/ch-dates';
import { replicatedTarget } from '../../shared/ch-tables';
import { PROFILE_SELECT_COLUMNS } from '../chart/chart.constants';
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

// Physical ClickHouse table names this module reads/writes.
const TABLE = {
  profiles: 'profiles',
  events: 'events',
  cohortMembers: 'cohort_members',
  cohortMetadata: 'cohort_metadata',
  eventProfileSummaryMv: 'event_profile_summary_mv',
  eventPropertyProfileSummaryMv: 'event_property_profile_summary_mv',
} as const;

// Max members materialized into cohort_members per compute. Larger cohorts are
// silently truncated to an arbitrary subset, so raise it for big deployments.
// Must be a positive safe integer: 0 is falsy at the `limit ? LIMIT ... : ''`
// call sites and would silently remove the cap.
const DEFAULT_COHORT_MATERIALIZE_LIMIT = 10_000;

export function cohortMaterializeLimit(config: CoreConfig): number {
  return (
    config.query.cohortMaterializeLimit ?? DEFAULT_COHORT_MATERIALIZE_LIMIT
  );
}

// Property cohorts aggregate every profile row for the project, so they can
// outgrow the server's memory. Two opt-in knobs bound them; with neither set the
// server defaults govern.
//
// COHORT_QUERY_MEMORY_LIMIT_BYTES hard cap for these queries
// COHORT_QUERY_SPILL_BYTES GROUP BY spills to disk past this
//
// A GROUP BY only spills once it crosses the threshold, so the threshold must
// sit BELOW the memory limit: inverted, the query is killed before it writes to
// disk (ClickHouse Cloud ships that inversion by default). When only the limit
// is set, or the pair is inverted, the threshold derives as limit/3.
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
// 'event_date')` on finished text — a fragment has no text to rewrite.
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

/** The trimmed string form used for every filter comparand. */
function trimmedComparand(value: unknown): string {
  return String(value).trim();
}

// One event-property filter. Values bind; the property key is a Map key, so it
// binds as a value too. An `IN`/`NOT IN` list becomes one `Array(String)`
// param; an empty list matches nothing.
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

// "Exactly 0" and "at most 0" both mean the profile never did the event.
// Neither can be expressed as a HAVING on the summary MVs: those hold a row
// only for a (project, profile, event, day) that actually happened, so every
// group that reaches the HAVING already has countMerge(event_count) >= 1 and
// the criterion returns nothing. The query has to be inverted instead.
//
// `gte 0` is not "never" — it matches every profile — and zFrequency rejects
// it, so it stays on the ordinary HAVING path.
function isNeverFrequency(frequency: Frequency): boolean {
  return (
    frequency.count === 0 &&
    (frequency.operator === 'eq' || frequency.operator === 'lte')
  );
}

// Every profile in the project except the ones the summary MV knows about.
// The timeframe stays inside the subquery, so "never did X in the last 30
// days" keeps including someone who did X 60 days ago, matching how the
// timeframe control reads for a positive criterion.
//
// DISTINCT rather than FINAL: profiles is a ReplacingMergeTree and FINAL
// cannot spill to disk, so on wide projects the dedup is what runs out of
// memory (same reason buildPropertyBasedCohortQuery groups instead of reading
// through FINAL). Only the id is needed here, so deduplicating it is enough —
// and the other branches of buildEventCriteriaQuery also emit one row per
// profile, which the INTERSECT / UNION DISTINCT combination depends on.
function buildNeverDidEventQuery(
  projectId: string,
  didEventQuery: SqlFragment
): SqlFragment {
  return sql`
    SELECT DISTINCT id AS profile_id
    FROM ${sql.id(TABLE.profiles)}
    WHERE project_id = ${sql.string(projectId)}
      AND id NOT IN (${didEventQuery})
  `;
}

export function buildEventCriteriaQuery(
  projectId: string,
  criteria: EventCriteria
): SqlFragment {
  const { name, filters, timeframe, frequency } = criteria;
  const timeConstraint = buildTimeConstraint(timeframe, sql.id('event_date'));
  const project = sql.string(projectId);
  const eventName = sql.string(name);
  const hasEventPropertyFilters = filters.some((f) =>
    f.name.startsWith('properties.')
  );

  if (hasEventPropertyFilters) {
    const propertyConditions = sql.join(
      filters
        .filter((f) => f.name.startsWith('properties.'))
        .map(eventPropertyCondition),
      ' OR '
    );

    if (frequency) {
      if (isNeverFrequency(frequency)) {
        // "Never did X where plan = pro" reads as "has no matching (event,
        // property) row", so the property predicates go inside the exclusion:
        // someone who did the event with plan = free is a member.
        return buildNeverDidEventQuery(
          projectId,
          sql`
            SELECT profile_id
            FROM ${sql.id(TABLE.eventPropertyProfileSummaryMv)}
            WHERE project_id = ${project}
              AND name = ${eventName}
              AND ${timeConstraint}
              AND (${propertyConditions})
          `
        );
      }

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
    if (isNeverFrequency(frequency)) {
      return buildNeverDidEventQuery(
        projectId,
        sql`
          SELECT profile_id
          FROM ${sql.id(TABLE.eventProfileSummaryMv)}
          WHERE project_id = ${project}
            AND name = ${eventName}
            AND ${timeConstraint}
        `
      );
    }

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

// The bare profiles columns a cohort filter may reach. Every name is
// qualified by the time it gets here, and anything outside the list is a
// filter naming a column that is not the caller's to read (GHSA-gvwr-5684-wjqc).
const COHORT_PROFILE_COLUMNS = PROFILE_SELECT_COLUMNS.map(
  (column) => `profiles.${column}`
);

// `profile.<x>` and `profiles.<x>` name the same column; normalizing first
// makes the dedup in buildProfileCohortHavingClause see them as one.
function normalizeProfileColumn(name: string): string {
  return name.replace(/^profile\./, 'profiles.');
}

// SQL for a profile filter's column: either a properties Map lookup or a plain
// column, qualified with the table name. Cohort definitions come from the API,
// so both halves are user-controlled: the Map key is a *value* and binds as
// one, and the plain column goes through `sql.id`, which throws rather than
// inlining anything that is not a bare (once-qualified) identifier.
function profileColumnAccess(normalizedName: string): SqlFragment {
  if (normalizedName.startsWith('profiles.properties.')) {
    const propKey = normalizedName.replace('profiles.properties.', '');
    return sql`profiles.properties[${sql.string(propKey)}]`;
  }
  return sql.id(normalizedName, COHORT_PROFILE_COLUMNS);
}

function buildProfileCohortHavingClause(
  definition: PropertyBasedCohortDefinition
): SqlFragment | null {
  const { properties, operator } = definition.criteria;

  // Every argMax below must order candidate rows IDENTICALLY, or equal-version
  // rows with conflicting fields could each win a different column and match an
  // AND cohort against a combination no stored row contains. One shared key (the
  // version column, tie-broken by a hash of every referenced column) makes all
  // aggregates pick the same winning row. The hash keeps comparison state at a
  // fixed 8 bytes.
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
// closed on purpose), so the criteria fold left.
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

// Every criterion emits one row per matching profile under the column name
// profile_id, which is what lets them be combined as sets.
export function buildEventBasedCohortQuery(
  projectId: string,
  definition: EventBasedCohortDefinition
): SqlFragment {
  const { events, operator } = definition.criteria;

  const queries = events.map((eventCriteria) =>
    buildEventCriteriaQuery(projectId, eventCriteria)
  );

  return combineCriteriaQueries(queries, operator);
}

export async function computeEventBasedCohort(
  deps: ServiceDeps,
  projectId: string,
  definition: EventBasedCohortDefinition,
  limit?: number
): Promise<string[]> {
  const combinedQuery = buildEventBasedCohortQuery(projectId, definition);

  // The LIMIT has to wrap the combination, not trail it: appended to an
  // INTERSECT / UNION chain, ClickHouse applies it to the last SELECT alone, and
  // a "never did X" operand is most of the project's profiles.
  const finalQuery = limit
    ? sql`SELECT profile_id FROM (${combinedQuery}) LIMIT ${sql.uint64(limit)}`
    : combinedQuery;

  const results = await chQuery<{ profile_id: string }>(deps, finalQuery);
  return results.map((r) => r.profile_id);
}

export async function countEventBasedCohort(
  deps: ServiceDeps,
  projectId: string,
  definition: EventBasedCohortDefinition
): Promise<number> {
  const combinedQuery = buildEventBasedCohortQuery(projectId, definition);

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
      // Resolve the newest row inside a GROUP BY instead of FINAL. The key is
      // shared by every wrapped column (see buildProfileCohortHavingClause), so all
      // aggregates read the SAME winning row; FINAL breaks version ties by part
      // order, which can shift under a background merge.
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

/**
 * The window `mostEvents` / `popularRoutes` read, bounding the event scan.
 * `YYYY-MM-DD HH:mm:ss`, as `getChartStartEndDate` returns it.
 */
export interface CohortActivityWindow {
  startDate: string;
  endDate: string;
}

const DEFAULT_COHORT_ACTIVITY_LIMIT = 10;

function createdAtWithin({
  startDate,
  endDate,
}: CohortActivityWindow): SqlFragment {
  return sql`created_at BETWEEN toDateTime(${sql.string(formatClickhouseDate(startDate))}) AND toDateTime(${sql.string(formatClickhouseDate(endDate))})`;
}

function cohortMemberIdsSubquery(
  projectId: string,
  cohortId: string
): SqlFragment {
  return sql`
    SELECT profile_id FROM ${sql.id(TABLE.cohortMembers)} FINAL
    WHERE cohort_id = ${sql.string(cohortId)}
      AND project_id = ${sql.string(projectId)}
  `;
}

export function cohortMemberEventsQuery(
  projectId: string,
  cohortId: string,
  window: CohortActivityWindow,
  limit: number
): SqlFragment {
  return sql`
    SELECT name, count() AS count
    FROM ${sql.id(TABLE.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND ${createdAtWithin(window)}
      AND profile_id IN (${cohortMemberIdsSubquery(projectId, cohortId)})
      AND name NOT IN ('screen_view', 'session_start', 'session_end')
    GROUP BY name
    ORDER BY count DESC
    LIMIT ${sql.uint64(limit)}
  `;
}

export function getCohortMemberEvents(
  deps: ServiceDeps,
  projectId: string,
  cohortId: string,
  window: CohortActivityWindow,
  limit = DEFAULT_COHORT_ACTIVITY_LIMIT
): Promise<{ name: string; count: number }[]> {
  return chQuery<{ name: string; count: number }>(
    deps,
    cohortMemberEventsQuery(projectId, cohortId, window, limit)
  );
}

export async function getCohortEventsPerDay(
  deps: ServiceDeps,
  projectId: string,
  cohortId: string,
  days = 30
): Promise<{ date: string; count: number }[]> {
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

export function cohortMemberRoutesQuery(
  projectId: string,
  cohortId: string,
  window: CohortActivityWindow,
  limit: number
): SqlFragment {
  return sql`
    SELECT path, count() AS count
    FROM ${sql.id(TABLE.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND ${createdAtWithin(window)}
      AND profile_id IN (${cohortMemberIdsSubquery(projectId, cohortId)})
      AND name = 'screen_view'
      AND path != ''
    GROUP BY path
    ORDER BY count DESC
    LIMIT ${sql.uint64(limit)}
  `;
}

export function getCohortMemberRoutes(
  deps: ServiceDeps,
  projectId: string,
  cohortId: string,
  window: CohortActivityWindow,
  limit = DEFAULT_COHORT_ACTIVITY_LIMIT
): Promise<{ path: string; count: number }[]> {
  return chQuery<{ path: string; count: number }>(
    deps,
    cohortMemberRoutesQuery(projectId, cohortId, window, limit)
  );
}

export function createCohortService(
  deps: ServiceDeps,
  _services: () => Services
) {
  function updateMembership(cohortId: string): Promise<void> {
    return updateCohortMembership(deps, cohortId);
  }

  function listCohortIds(): Promise<string[]> {
    return listRefreshableCohortIds(deps);
  }

  /**
   * Enqueue a recompute for a cohort.
   *
   * Uses `deduplicationId` rather than `jobId`. A fixed jobId makes BullMQ
   * short-circuit `add` for as long as *any* record for that id exists in Redis
   * — and `removeOnComplete: { age }` is not a TTL, it only trims on some other
   * job in the queue finishing. That deadlocks: nothing can be added because
   * the completed record is still there, and the record is never collected
   * because nothing gets added. `deduplicationId`, in contrast, is released by
   * `moveToFinished` on both completion and terminal failure, so it only
   * collapses a compute that is genuinely still in flight.
   */
  async function enqueueCompute(cohortId: string): Promise<void> {
    await deps.queues.cohortCompute.cohortCompute.add(
      { cohortId },
      { deduplicationId: `cohort-${cohortId}` }
    );
  }

  return {
    updateMembership,
    listRefreshableCohortIds: listCohortIds,
    enqueueCompute,
  };
}
