import sqlstring from 'sqlstring';
import type {
  CohortDefinition,
  EventBasedCohortDefinition,
  EventCriteria,
  Frequency,
  PropertyBasedCohortDefinition,
  Timeframe,
} from '@openpanel/validation';
import type { IChartEventFilter } from '@openpanel/validation';

import { ch, chQuery, TABLE_NAMES } from '../clickhouse/client';
import { db } from '../prisma-client';
import { getEventFiltersWhereClause } from './chart.service';

/**
 * Build time constraint SQL from timeframe
 */
function buildTimeConstraint(timeframe: Timeframe): string {
  if (timeframe.type === 'relative') {
    // Parse relative time like "30d", "90d"
    const match = timeframe.value.match(/^(\d+)d$/);
    if (!match) {
      throw new Error(`Invalid relative timeframe: ${timeframe.value}`);
    }
    const days = Number.parseInt(match[1]!, 10);
    return `created_at >= now() - INTERVAL ${days} DAY`;
  } else {
    // Absolute time: start date and optional end date
    const start = timeframe.start;
    const end = timeframe.end || 'now()';

    if (timeframe.end) {
      return `created_at BETWEEN toDateTime('${start}') AND toDateTime('${end}')`;
    } else {
      // "Since date" - no end date
      return `created_at >= toDateTime('${start}')`;
    }
  }
}

/**
 * Convert frequency operator to SQL comparison
 */
function getFrequencyOperator(frequency: Frequency): string {
  switch (frequency.operator) {
    case 'at_least':
      return `>= ${frequency.count}`;
    case 'exactly':
      return `= ${frequency.count}`;
    case 'at_most':
      return `<= ${frequency.count}`;
    default:
      return `>= ${frequency.count}`;
  }
}

/**
 * Build ClickHouse query for a single event criteria
 */
function buildEventCriteriaQuery(
  projectId: string,
  criteria: EventCriteria,
): string {
  const { name, filters, timeframe, frequency } = criteria;

  // Build time constraint
  const timeConstraint = buildTimeConstraint(timeframe);

  // Build event filters
  const filterWhere = filters.length > 0
    ? getEventFiltersWhereClause(filters)
    : {};
  const filterClauses = Object.values(filterWhere);
  const filterClause = filterClauses.length > 0
    ? `AND ${filterClauses.join(' AND ')}`
    : '';

  // Check if there are any property filters
  // Materialized view doesn't have property columns, only events table has them
  const hasPropertyFilters = filters.length > 0;

  // Use materialized view for frequency checks ONLY if no property filters
  if (frequency && !hasPropertyFilters) {
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

  // For queries with property filters and frequency, use events table with GROUP BY
  if (frequency) {
    const frequencyOp = getFrequencyOperator(frequency);

    return `
      SELECT profile_id
      FROM ${TABLE_NAMES.events}
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND name = ${sqlstring.escape(name)}
        AND profile_id != device_id
        AND ${timeConstraint}
        ${filterClause}
      GROUP BY profile_id
      HAVING count(*) ${frequencyOp}
    `;
  }

  // For simple "did event" queries, use events table
  return `
    SELECT DISTINCT profile_id
    FROM ${TABLE_NAMES.events}
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND name = ${sqlstring.escape(name)}
      AND profile_id != device_id
      AND ${timeConstraint}
      ${filterClause}
  `;
}

/**
 * Compute event-based cohort membership
 * Returns array of profile IDs that match the criteria
 */
export async function computeEventBasedCohort(
  projectId: string,
  definition: EventBasedCohortDefinition,
): Promise<string[]> {
  const { events, operator } = definition.criteria;

  const queries = events.map((eventCriteria) => {
    return buildEventCriteriaQuery(projectId, eventCriteria);
  });

  // Combine queries based on AND/OR operator
  const combinedQuery =
    operator === 'and'
      ? queries.join(' INTERSECT ')
      : queries.join(' UNION DISTINCT ');

  const results = await chQuery<{ profile_id: string }>(combinedQuery);
  return results.map((r) => r.profile_id);
}

/**
 * Build profile filter WHERE clause
 * Similar to getEventFiltersWhereClause but for profiles table
 */
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

    // Determine the column access pattern
    // Replace profile. with profiles. since we're querying the profiles table directly
    const normalizedName = name.replace(/^profile\./, 'profiles.');
    let columnAccess: string;

    if (normalizedName.startsWith('profiles.properties.')) {
      const propKey = normalizedName.replace('profiles.properties.', '');
      columnAccess = `profiles.properties['${propKey}']`;
    } else {
      // For profiles.email, profiles.first_name, etc. or any other column
      columnAccess = normalizedName;
    }

    // Build WHERE clause based on operator
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
          .map((val) => `${columnAccess} LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`)
          .join(' OR ')})`;
        break;
      }
      case 'doesNotContain': {
        where[id] = `(${value
          .map((val) => `${columnAccess} NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`)
          .join(' OR ')})`;
        break;
      }
      case 'startsWith': {
        where[id] = `(${value
          .map((val) => `${columnAccess} LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`)
          .join(' OR ')})`;
        break;
      }
      case 'endsWith': {
        where[id] = `(${value
          .map((val) => `${columnAccess} LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`)
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

/**
 * Compute property-based cohort membership
 */
export async function computePropertyBasedCohort(
  projectId: string,
  definition: PropertyBasedCohortDefinition,
): Promise<string[]> {
  const { properties, operator } = definition.criteria;

  // Build property filters
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
  `;

  const results = await chQuery<{ profile_id: string }>(query);
  return results.map((r) => r.profile_id);
}

/**
 * Store cohort membership in ClickHouse
 */
export async function storeCohortMembership(
  projectId: string,
  cohortId: string,
  profileIds: string[],
  version: number,
): Promise<void> {
  if (profileIds.length === 0) return;

  // Use JSONEachRow format for better Map type handling
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const data = profileIds.map((profileId) => ({
    project_id: projectId,
    cohort_id: cohortId,
    profile_id: profileId,
    matched_at: now,
    matching_properties: {},
    version: version,
  }));

  await ch.insert({
    table: TABLE_NAMES.cohort_members,
    values: data,
    format: 'JSONEachRow',
  });

  // Update metadata
  const sampleProfiles = profileIds.slice(0, 10);
  await ch.insert({
    table: TABLE_NAMES.cohort_metadata,
    values: [{
      project_id: projectId,
      cohort_id: cohortId,
      member_count: profileIds.length,
      last_computed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      sample_profiles: sampleProfiles,
      version: version,
    }],
    format: 'JSONEachRow',
  });
}

/**
 * Get cohort members with pagination
 */
export async function getCohortMembers(
  cohortId: string,
  projectId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ profileIds: string[]; total: number }> {
  const cohort = await db.cohort.findUnique({ where: { id: cohortId } });

  if (!cohort) {
    throw new Error('Cohort not found');
  }

  // If stored in ClickHouse, query from cohort_members table
  if (!cohort.computeOnDemand) {
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

    const results = await chQuery<{ profile_id: string; total: number }>(
      query,
    );
    return {
      profileIds: results.map((r) => r.profile_id),
      total: results[0]?.total || 0,
    };
  }

  // Otherwise, compute on-demand
  const definition = cohort.definition as CohortDefinition;
  const profileIds = await computeCohort(projectId, definition);

  return {
    profileIds: profileIds.slice(
      opts?.offset || 0,
      (opts?.offset || 0) + (opts?.limit || 50),
    ),
    total: profileIds.length,
  };
}

/**
 * Get cohort count
 */
export async function getCohortCount(
  cohortId: string,
  projectId: string,
): Promise<number> {
  const cohort = await db.cohort.findUnique({ where: { id: cohortId } });

  if (!cohort) {
    throw new Error('Cohort not found');
  }

  // Check if cached in PostgreSQL
  if (cohort.profileCount && cohort.lastComputedAt) {
    const age = Date.now() - cohort.lastComputedAt.getTime();
    if (age < 15 * 60 * 1000) {
      // 15 minutes
      return cohort.profileCount;
    }
  }

  // Query from ClickHouse
  if (!cohort.computeOnDemand) {
    const result = await chQuery<{ count: number }>(`
      SELECT count() as count
      FROM ${TABLE_NAMES.cohort_members} FINAL
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND cohort_id = ${sqlstring.escape(cohortId)}
    `);
    return result[0]?.count || 0;
  }

  // Compute on-demand
  const definition = cohort.definition as CohortDefinition;
  const profileIds = await computeCohort(projectId, definition);
  return profileIds.length;
}

/**
 * Main compute function - routes to correct implementation
 */
export async function computeCohort(
  projectId: string,
  definition: CohortDefinition,
): Promise<string[]> {
  if (definition.type === 'event') {
    return computeEventBasedCohort(projectId, definition);
  } else if (definition.type === 'property') {
    return computePropertyBasedCohort(projectId, definition);
  }
  return [];
}

/**
 * Update cohort membership (for dynamic cohorts)
 */
export async function updateCohortMembership(
  cohortId: string,
): Promise<void> {
  const cohort = await db.cohort.findUnique({ where: { id: cohortId } });

  if (!cohort || cohort.isStatic || cohort.computeOnDemand) {
    return; // Skip static and on-demand cohorts
  }

  const definition = cohort.definition as CohortDefinition;
  const profileIds = await computeCohort(cohort.projectId, definition);

  // Increment version for ReplacingMergeTree
  const version = Date.now();

  // Store new membership
  await storeCohortMembership(
    cohort.projectId,
    cohort.id,
    profileIds,
    version,
  );

  // Update cache in PostgreSQL
  await db.cohort.update({
    where: { id: cohortId },
    data: {
      profileCount: profileIds.length,
      lastComputedAt: new Date(),
    },
  });
}

/**
 * Get profiles in cohort as a Set (for filtering)
 */
export async function getProfilesInCohort(
  cohortId: string,
  projectId: string,
): Promise<Set<string>> {
  const { profileIds } = await getCohortMembers(cohortId, projectId, {
    limit: 100000, // Large limit for filtering
  });
  return new Set(profileIds);
}
