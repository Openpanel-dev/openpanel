import sqlstring from 'sqlstring';
import type {
  CohortDefinition,
  EventBasedCohortDefinition,
  EventCriteria,
  Frequency,
  IChartEventFilter,
  PropertyBasedCohortDefinition,
  Timeframe,
} from '@openpanel/validation';

import { cohortComputeQueue } from '@openpanel/queue';
import type { ClickHouseSettings } from '@clickhouse/client';
import {
  TABLE_NAMES,
  ch,
  chQuery,
  getReplicatedTableName,
} from '../clickhouse/client';
import { db } from '../prisma-client';
import { buildFilterWhere } from './filter-where.service';
import {
  getProfiles,
  profileSearchSql,
  type IServiceProfile,
} from './profile.service';

// Max members materialized into cohort_members per compute. Cohorts larger
// than this are silently truncated to an arbitrary subset, so deployments
// with bigger cohorts need to raise it — env-tunable to avoid an image
// rebuild for what is really a sizing knob.
//
// Strictly a positive safe integer: anything else falls back to the
// default. Number.parseInt would accept '5000junk' or '-1' (LIMIT -1 is a
// query error), and 0 is falsy at the `limit ? LIMIT ... : ''` call sites,
// which would silently remove the cap entirely.
const COHORT_MATERIALIZE_LIMIT_RAW = process.env.COHORT_MATERIALIZE_LIMIT;
const COHORT_MATERIALIZE_LIMIT_PARSED =
  COHORT_MATERIALIZE_LIMIT_RAW && /^\d+$/.test(COHORT_MATERIALIZE_LIMIT_RAW)
    ? Number(COHORT_MATERIALIZE_LIMIT_RAW)
    : Number.NaN;
export const COHORT_MATERIALIZE_LIMIT =
  Number.isSafeInteger(COHORT_MATERIALIZE_LIMIT_PARSED) &&
  COHORT_MATERIALIZE_LIMIT_PARSED > 0
    ? COHORT_MATERIALIZE_LIMIT_PARSED
    : 10000;

// Strictly a positive safe integer, or undefined — same validation rationale
// as COHORT_MATERIALIZE_LIMIT above.
function parsePositiveIntEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw || !/^\d+$/.test(raw)) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
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
const COHORT_QUERY_MEMORY_LIMIT_BYTES = parsePositiveIntEnv(
  'COHORT_QUERY_MEMORY_LIMIT_BYTES',
);
const COHORT_QUERY_SPILL_BYTES_RAW = parsePositiveIntEnv(
  'COHORT_QUERY_SPILL_BYTES',
);
const COHORT_QUERY_SPILL_BYTES =
  COHORT_QUERY_MEMORY_LIMIT_BYTES !== undefined &&
  (COHORT_QUERY_SPILL_BYTES_RAW === undefined ||
    COHORT_QUERY_SPILL_BYTES_RAW >= COHORT_QUERY_MEMORY_LIMIT_BYTES)
    ? Math.floor(COHORT_QUERY_MEMORY_LIMIT_BYTES / 3)
    : COHORT_QUERY_SPILL_BYTES_RAW;

export const PROFILE_COHORT_QUERY_SETTINGS: ClickHouseSettings = {
  ...(COHORT_QUERY_SPILL_BYTES !== undefined
    ? { max_bytes_before_external_group_by: String(COHORT_QUERY_SPILL_BYTES) }
    : {}),
  ...(COHORT_QUERY_MEMORY_LIMIT_BYTES !== undefined
    ? { max_memory_usage: String(COHORT_QUERY_MEMORY_LIMIT_BYTES) }
    : {}),
};

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
  criteria: EventCriteria,
): string {
  const { name, filters, timeframe, frequency } = criteria;
  const timeConstraint = buildTimeConstraint(timeframe);
  const hasEventPropertyFilters = filters.some(
    (f) =>
      f.name.startsWith('properties.') &&
      !f.name.startsWith('profile.properties.'),
  );

  if (hasEventPropertyFilters) {
    const propertyFilters = filters.filter((f) =>
      f.name.startsWith('properties.'),
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
                  `property_value LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`,
              )
              .join(' OR ')}))`;
          case 'doesNotContain':
            return `(property_key = ${sqlstring.escape(propertyKey)} AND (${value
              .map(
                (val) =>
                  `property_value NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`,
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
        FROM ${TABLE_NAMES.profile_event_property_summary_mv}
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
      FROM ${TABLE_NAMES.profile_event_property_summary_mv}
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
      FROM ${TABLE_NAMES.profile_event_summary_mv}
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND name = ${sqlstring.escape(name)}
        AND ${timeConstraint.replace('created_at', 'event_date')}
      GROUP BY profile_id
      HAVING countMerge(event_count) ${frequencyOp}
    `;
  }

  return `
    SELECT DISTINCT profile_id
    FROM ${TABLE_NAMES.profile_event_summary_mv}
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
  definition: PropertyBasedCohortDefinition,
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
    new Set(properties.map((f) => profileColumnAccess(f.name))),
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
  limit?: number,
): string {
  const havingClause = buildProfileCohortHavingClause(definition);

  if (!havingClause) {
    return `SELECT id as profile_id FROM ${TABLE_NAMES.profiles} WHERE 1=0`;
  }

  // Resolve each profile's newest row with GROUP BY + argMax instead of
  // FINAL: FINAL cannot spill to disk, so on wide projects the dedup itself
  // is what runs out of memory. The aggregate shape spills normally under
  // PROFILE_COHORT_QUERY_SETTINGS, and filters on aggregates move to HAVING.
  return `
    SELECT id as profile_id
    FROM ${TABLE_NAMES.profiles}
    WHERE project_id = ${sqlstring.escape(projectId)}
    GROUP BY id
    HAVING (${havingClause})
    ${limit ? `LIMIT ${limit}` : ''}
  `;
}

export async function computeEventBasedCohort(
  projectId: string,
  definition: EventBasedCohortDefinition,
  limit?: number,
): Promise<string[]> {
  const { events, operator } = definition.criteria;

  const queries = events.map((eventCriteria) =>
    buildEventCriteriaQuery(projectId, eventCriteria),
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
  definition: EventBasedCohortDefinition,
): Promise<number> {
  const { events, operator } = definition.criteria;

  const queries = events.map((eventCriteria) =>
    buildEventCriteriaQuery(projectId, eventCriteria),
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
  { latestPerProfileKey }: { latestPerProfileKey?: string } = {},
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
          where[id] = `${columnAccess} = ${sqlstring.escape(String(value[0]).trim())}`;
        } else {
          where[id] = `${columnAccess} IN (${value
            .map((val) => sqlstring.escape(String(val).trim()))
            .join(', ')})`;
        }
        break;
      }
      case 'isNot': {
        if (value.length === 1) {
          where[id] = `${columnAccess} != ${sqlstring.escape(String(value[0]).trim())}`;
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
              `${columnAccess} LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`,
          )
          .join(' OR ')})`;
        break;
      }
      case 'doesNotContain': {
        where[id] = `(${value
          .map(
            (val) =>
              `${columnAccess} NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`,
          )
          .join(' OR ')})`;
        break;
      }
      case 'startsWith': {
        where[id] = `(${value
          .map(
            (val) =>
              `${columnAccess} LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`,
          )
          .join(' OR ')})`;
        break;
      }
      case 'endsWith': {
        where[id] = `(${value
          .map(
            (val) =>
              `${columnAccess} LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`,
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
  limit?: number,
): Promise<string[]> {
  if (!buildProfileCohortHavingClause(definition)) {
    return [];
  }

  const results = await chQuery<{ profile_id: string }>(
    buildPropertyBasedCohortQuery(projectId, definition, limit),
    PROFILE_COHORT_QUERY_SETTINGS,
  );
  return results.map((r) => r.profile_id);
}

export async function countPropertyBasedCohort(
  projectId: string,
  definition: PropertyBasedCohortDefinition,
): Promise<number> {
  if (!buildProfileCohortHavingClause(definition)) {
    return 0;
  }

  const results = await chQuery<{ count: number }>(
    `SELECT count() as count FROM (${buildPropertyBasedCohortQuery(projectId, definition)})`,
    PROFILE_COHORT_QUERY_SETTINGS,
  );
  return results[0]?.count ?? 0;
}

export async function storeCohortMembership(
  projectId: string,
  cohortId: string,
  profileIds: string[],
  version: number,
): Promise<void> {
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
      table: TABLE_NAMES.cohort_members,
      values: data,
      format: 'JSONEachRow',
    });
  }

  const sampleProfiles = profileIds.slice(0, 10);
  await ch.insert({
    table: TABLE_NAMES.cohort_metadata,
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
  opts?: { limit?: number; offset?: number },
): Promise<{ profileIds: string[]; total: number }> {
  const cohort = await db.cohort.findUnique({ where: { id: cohortId } });

  if (!cohort) {
    throw new Error('Cohort not found');
  }

  const query = `
    SELECT
      profile_id,
      count() OVER() as total
    FROM ${TABLE_NAMES.cohort_members} FINAL
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

export async function getCohortCount(
  cohortId: string,
  projectId: string,
): Promise<number> {
  const cohort = await db.cohort.findUnique({ where: { id: cohortId } });

  if (!cohort) {
    throw new Error('Cohort not found');
  }

  if (cohort.lastComputedAt) {
    const age = Date.now() - cohort.lastComputedAt.getTime();
    if (age < 15 * 60 * 1000) {
      return cohort.profileCount;
    }
  }

  const result = await chQuery<{ count: number }>(`
    SELECT count() as count
    FROM ${TABLE_NAMES.cohort_members} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND cohort_id = ${sqlstring.escape(cohortId)}
  `);
  return result[0]?.count || 0;
}

export async function computeCohort(
  projectId: string,
  definition: CohortDefinition,
  limit?: number,
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
  definition: CohortDefinition,
): Promise<number> {
  if (definition.type === 'event') {
    return countEventBasedCohort(projectId, definition);
  }
  if (definition.type === 'property') {
    return countPropertyBasedCohort(projectId, definition);
  }
  return 0;
}

export async function updateCohortMembership(
  cohortId: string,
): Promise<void> {
  const cohort = await db.cohort.findUnique({ where: { id: cohortId } });

  if (!cohort) {
    return;
  }

  const definition = cohort.definition as CohortDefinition;
  const profileIds = await computeCohort(
    cohort.projectId,
    definition,
    COHORT_MATERIALIZE_LIMIT,
  );

  const version = Date.now();

  // ReplacingMergeTree only dedupes within the same ORDER BY key
  // (project_id, cohort_id, profile_id), so profiles that fell out of the
  // cohort definition would otherwise linger forever. Clear them first.
  await ch.command({
    query: `DELETE FROM ${getReplicatedTableName(TABLE_NAMES.cohort_members)} WHERE cohort_id = ${sqlstring.escape(cohort.id)} AND project_id = ${sqlstring.escape(cohort.projectId)}`,
    clickhouse_settings: {
      lightweight_deletes_sync: '1',
    },
  });

  await storeCohortMembership(
    cohort.projectId,
    cohort.id,
    profileIds,
    version,
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
  cohortId: string,
  projectId: string,
): Promise<void> {
  const where = `cohort_id = ${sqlstring.escape(cohortId)} AND project_id = ${sqlstring.escape(projectId)}`;
  for (const table of [TABLE_NAMES.cohort_members, TABLE_NAMES.cohort_metadata]) {
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
  projectId: string,
): Promise<Set<string>> {
  const { profileIds } = await getCohortMembers(cohortId, projectId, {
    limit: 100000,
  });
  return new Set(profileIds);
}

/**
 * Enqueue a recompute for a cohort.
 *
 * Uses `deduplication` rather than a fixed `jobId`. A fixed jobId makes BullMQ
 * short-circuit `add` for as long as *any* record for that id exists in Redis —
 * and `removeOnComplete: { age }` is not a TTL, it only trims on some other
 * job in the queue finishing. That deadlocks: nothing can be added because the
 * completed record is still there, and the record is never collected because
 * nothing gets added. The deduplication key, in contrast, is released by
 * `moveToFinished` on both completion and terminal failure, so it only collapses
 * a compute that is genuinely still in flight.
 */
export async function enqueueCohortCompute(cohortId: string): Promise<void> {
  await cohortComputeQueue.add(
    'cohortCompute',
    { cohortId },
    {
      deduplication: { id: `cohort-${cohortId}` },
    },
  );
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
  const offset = Math.max(0, (cursor ?? 0) * take);
  const searchClause = profileSearchSql(search);
  const searchCondition = searchClause ? `AND ${searchClause}` : '';

  const extraConditions = filters?.length
    ? Object.values(
        buildFilterWhere(filters, projectId, {
          selfTable: 'profiles',
          profileIdExpr: 'id',
          groupsExpr: 'groups',
        }),
      )
    : [];
  const extraConditionSql = extraConditions.length
    ? `AND ${extraConditions.join(' AND ')}`
    : '';

  const rows = await chQuery<{ id: string; total_count: number }>(`
    SELECT id, count() OVER () AS total_count
    FROM ${TABLE_NAMES.profiles} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND id IN (
        SELECT profile_id FROM ${TABLE_NAMES.cohort_members} FINAL
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
  if (ids.length === 0) return { data: [], count };

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
  limit = 10,
): Promise<{ name: string; count: number }[]> {
  return chQuery<{ name: string; count: number }>(`
    SELECT name, count() AS count
    FROM ${TABLE_NAMES.events}
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND profile_id IN (
        SELECT profile_id FROM ${TABLE_NAMES.cohort_members} FINAL
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
  days = 30,
): Promise<{ date: string; count: number }[]> {
  const rows = await chQuery<{ date: string; count: number }>(`
    SELECT
      toDate(created_at) AS date,
      count() AS count
    FROM ${TABLE_NAMES.events}
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND created_at >= toDate(now() - INTERVAL ${days} DAY)
      AND profile_id IN (
        SELECT profile_id FROM ${TABLE_NAMES.cohort_members} FINAL
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
  limit = 10,
): Promise<{ path: string; count: number }[]> {
  return chQuery<{ path: string; count: number }>(`
    SELECT path, count() AS count
    FROM ${TABLE_NAMES.events}
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND profile_id IN (
        SELECT profile_id FROM ${TABLE_NAMES.cohort_members} FINAL
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
