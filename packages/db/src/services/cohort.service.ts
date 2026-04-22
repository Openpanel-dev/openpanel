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
import { TABLE_NAMES, ch, chQuery } from '../clickhouse/client';
import { db } from '../prisma-client';
import { getProfiles, type IServiceProfile } from './profile.service';

export const COHORT_MATERIALIZE_LIMIT = 10000;

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

export function buildPropertyBasedCohortQuery(
  projectId: string,
  definition: PropertyBasedCohortDefinition,
): string {
  const { properties, operator } = definition.criteria;
  const filterWhere = getProfileFiltersWhereClause(properties);
  const filterClauses = Object.values(filterWhere);

  if (filterClauses.length === 0) {
    return `SELECT id as profile_id FROM ${TABLE_NAMES.profiles} FINAL WHERE 1=0`;
  }

  const filterClause = filterClauses.join(
    operator === 'and' ? ' AND ' : ' OR ',
  );

  return `
    SELECT id as profile_id
    FROM ${TABLE_NAMES.profiles} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND (${filterClause})
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

    const normalizedName = name.replace(/^profile\./, 'profiles.');
    let columnAccess: string;

    if (normalizedName.startsWith('profiles.properties.')) {
      const propKey = normalizedName.replace('profiles.properties.', '');
      columnAccess = `profiles.properties['${propKey}']`;
    } else {
      columnAccess = normalizedName;
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
  const { properties, operator } = definition.criteria;
  const filterWhere = getProfileFiltersWhereClause(properties);
  const filterClauses = Object.values(filterWhere);

  if (filterClauses.length === 0) {
    return [];
  }

  const filterClause = filterClauses.join(
    operator === 'and' ? ' AND ' : ' OR ',
  );

  const query = `
    SELECT id as profile_id
    FROM ${TABLE_NAMES.profiles} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND (${filterClause})
    ${limit ? `LIMIT ${limit}` : ''}
  `;

  const results = await chQuery<{ profile_id: string }>(query);
  return results.map((r) => r.profile_id);
}

export async function countPropertyBasedCohort(
  projectId: string,
  definition: PropertyBasedCohortDefinition,
): Promise<number> {
  const { properties, operator } = definition.criteria;
  const filterWhere = getProfileFiltersWhereClause(properties);
  const filterClauses = Object.values(filterWhere);

  if (filterClauses.length === 0) {
    return 0;
  }

  const filterClause = filterClauses.join(
    operator === 'and' ? ' AND ' : ' OR ',
  );

  const query = `
    SELECT count() as count
    FROM ${TABLE_NAMES.profiles} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND (${filterClause})
  `;

  const results = await chQuery<{ count: number }>(query);
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
  await ch.command({
    query: `ALTER TABLE ${TABLE_NAMES.cohort_members} DELETE WHERE cohort_id = ${sqlstring.escape(cohortId)} AND project_id = ${sqlstring.escape(projectId)}`,
  });
  await ch.command({
    query: `ALTER TABLE ${TABLE_NAMES.cohort_metadata} DELETE WHERE cohort_id = ${sqlstring.escape(cohortId)} AND project_id = ${sqlstring.escape(projectId)}`,
  });
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

export async function enqueueCohortCompute(cohortId: string): Promise<void> {
  await cohortComputeQueue.add(
    'cohortCompute',
    { cohortId },
    {
      jobId: `cohort-${cohortId}`,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    },
  );
}

export async function removeCohortComputeJob(cohortId: string): Promise<void> {
  await cohortComputeQueue.remove(
    `cohort-${cohortId}`,
  );
}

export async function listCohortMemberProfiles({
  projectId,
  cohortId,
  cursor,
  take,
  search,
}: {
  projectId: string;
  cohortId: string;
  cursor?: number;
  take: number;
  search?: string;
}): Promise<{ data: IServiceProfile[]; count: number }> {
  const offset = Math.max(0, (cursor ?? 0) * take);
  const trimmed = search?.trim();
  const searchCondition = trimmed
    ? `AND (email ILIKE ${sqlstring.escape(`%${trimmed}%`)} OR first_name ILIKE ${sqlstring.escape(`%${trimmed}%`)} OR last_name ILIKE ${sqlstring.escape(`%${trimmed}%`)})`
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
