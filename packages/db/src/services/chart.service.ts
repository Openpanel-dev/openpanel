import { uniq } from 'ramda';
import sqlstring from 'sqlstring';

import { DateTime, stripLeadingAndTrailingSlashes } from '@openpanel/common';
import type {
  IChartEventFilter,
  IChartInput,
  IChartRange,
  IGetChartDataInput,
  ICustomEventDefinition,
  CohortDefinition,
} from '@openpanel/validation';

import { TABLE_NAMES, formatClickhouseDate } from '../clickhouse/client';
import { createSqlBuilder } from '../sql-builder';
import {
  getCustomEventByName,
  expandCustomEventToSQL,
} from './custom-event.service';
import { db } from '../../index';
import { buildEventCriteriaQuery, buildPropertyBasedCohortQuery } from './cohort.service';

// Cache for materialized columns mapping
let materializedColumnsCache: Record<string, string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get materialized columns from database with caching
 */
async function getMaterializedColumns(): Promise<Record<string, string>> {
  const now = Date.now();

  // Return cached value if still valid
  if (materializedColumnsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return materializedColumnsCache;
  }

  try {
    const columns = await db.materializedColumn.findMany({
      where: { status: 'active' },
      select: { propertyKey: true, columnName: true },
    });

    const mapping: Record<string, string> = {};
    for (const col of columns) {
      mapping[`properties.${col.propertyKey}`] = col.columnName;
    }

    materializedColumnsCache = mapping;
    cacheTimestamp = now;
    return mapping;
  } catch (error) {
    // If database query fails, return empty mapping (fallback to properties['key'])
    console.warn('Failed to load materialized columns:', error);
    return {};
  }
}

/**
 * Initialize materialized columns cache (call at startup)
 */
export async function initMaterializedColumnsCache(): Promise<void> {
  await getMaterializedColumns();
}

/**
 * Refresh materialized columns cache (call after adding new columns)
 */
export async function refreshMaterializedColumnsCache(): Promise<void> {
  materializedColumnsCache = null;
  cacheTimestamp = 0;
  await getMaterializedColumns();
}

// Initialize cache on module load (lazy)
getMaterializedColumns().catch(() => {
  // Ignore errors on initial load
});

// Cohort metadata type
type CohortMetadata = {
  id: string;
  computeOnDemand: boolean;
  definition: CohortDefinition;
};

/**
 * Fetch metadata for multiple cohorts from Postgres (no cache - always fresh)
 */
export async function fetchCohortsMetadata(
  cohortIds: string[],
): Promise<Map<string, CohortMetadata>> {
  if (cohortIds.length === 0) {
    return new Map();
  }

  // Fetch all cohorts in one query
  const cohorts = await db.cohort.findMany({
    where: { id: { in: cohortIds } },
    select: { id: true, computeOnDemand: true, definition: true },
  });

  return new Map(
    cohorts.map((c) => [
      c.id,
      {
        id: c.id,
        computeOnDemand: c.computeOnDemand,
        definition: c.definition as CohortDefinition,
      },
    ]),
  );
}

/**
 * Generate cohort membership query for CTE
 * Returns the full SELECT query
 */
export function buildCohortMembershipQuery(
  cohortId: string,
  projectId: string,
  cohortMeta?: CohortMetadata,
): string {
  // Pre-computed cohorts or missing metadata: read from stored membership
  if (!cohortMeta || !cohortMeta.computeOnDemand) {
    return `
      SELECT profile_id
      FROM ${TABLE_NAMES.cohort_members} FINAL
      WHERE cohort_id = ${sqlstring.escape(cohortId)}
        AND project_id = ${sqlstring.escape(projectId)}
    `;
  }

  // Dynamic cohorts: build query from definition
  const definition = cohortMeta.definition;

  if (definition.type === 'event') {
    const { events, operator } = definition.criteria;
    const queries = events.map((eventCriteria) =>
      buildEventCriteriaQuery(projectId, eventCriteria),
    );

    return operator === 'and'
      ? queries.join(' INTERSECT ')
      : queries.join(' UNION DISTINCT ');
  } else if (definition.type === 'property') {
    return buildPropertyBasedCohortQuery(projectId, definition);
  }

  throw new Error(`Unknown cohort type: ${(definition as any).type}`);
}

/**
 * Get CTE name for a cohort (quoted with backticks)
 */
export function getCohortCteName(cohortId: string): string {
  return `\`cohort-${cohortId}\``;
}

/**
 * Reference to cohort membership from CTE
 * This is used in IN clauses and JOINs
 */
function getCohortMembershipSubquery(cohortId: string): string {
  return `SELECT profile_id FROM ${getCohortCteName(cohortId)}`;
}

/**
 * Generate cohort membership subquery - handles both dynamic and pre-computed cohorts
 */
async function getCohortMembershipSubquery(
  cohortId: string,
  projectId: string,
): Promise<string> {
  const cohort = await db.cohort.findUnique({
    where: { id: cohortId },
    select: { computeOnDemand: true, definition: true, id: true },
  });

  if (!cohort) {
    throw new Error(`Cohort not found: ${cohortId}`);
  }

  // Pre-computed cohorts: read from stored membership
  if (!cohort.computeOnDemand) {
    return `
      SELECT profile_id
      FROM ${TABLE_NAMES.cohort_members} FINAL
      WHERE cohort_id = ${sqlstring.escape(cohortId)}
        AND project_id = ${sqlstring.escape(projectId)}
    `;
  }

  // Dynamic cohorts: compute membership inline
  const definition = cohort.definition as CohortDefinition;

  if (definition.type === 'event') {
    const { events, operator } = definition.criteria;
    const queries = events.map((eventCriteria) =>
      buildEventCriteriaQuery(projectId, eventCriteria),
    );

    return operator === 'and'
      ? queries.join(' INTERSECT ')
      : queries.join(' UNION DISTINCT ');
  } else if (definition.type === 'property') {
    return buildPropertyBasedCohortQuery(projectId, definition);
  }

  throw new Error(`Unknown cohort type: ${definition.type}`);
}

export function transformPropertyKey(property: string) {
  const propertyPatterns = ['properties', 'profile.properties'];
  const match = propertyPatterns.find((pattern) =>
    property.startsWith(`${pattern}.`),
  );

  if (!match) {
    return property;
  }

  if (property.includes('*')) {
    return property
      .replace(/^properties\./, '')
      .replace('.*.', '.%.')
      .replace(/\[\*\]$/, '.%')
      .replace(/\[\*\].?/, '.%.');
  }

  return `${match}['${property.replace(new RegExp(`^${match}.`), '')}']`;
}

export function getSelectPropertyKey(
  property: string,
  projectId?: string,
  cohortId?: string,
) {
  // Handle cohort breakdown
  // Use cohortId parameter if provided, otherwise parse from property name (backwards compatibility)
  const extractedCohortId = cohortId || (property.startsWith('cohort:') ? property.split(':')[1] : null);

  if (extractedCohortId && projectId) {
    const subquery = getCohortMembershipSubquery(extractedCohortId);

    return `if(
      profile_id IN (
        ${subquery}
      ),
      'In Cohort',
      'Not In Cohort'
    )`;
  }

  if (property === 'has_profile') {
    return `if(profile_id != device_id, 'true', 'false')`;
  }

  // Handle profile.created_at - it's stored as created_at in the profiles table
  if (property === 'profile.created_at') {
    return 'profile.created_at';
  }

  const propertyPatterns = ['properties', 'profile.properties'];

  const match = propertyPatterns.find((pattern) =>
    property.startsWith(`${pattern}.`),
  );
  if (!match) return property;

  // Use materialized columns from cache if available
  if (materializedColumnsCache && materializedColumnsCache[property]) {
    return materializedColumnsCache[property]!;
  }

  if (property.includes('*')) {
    return `arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(${match}, ${sqlstring.escape(
      transformPropertyKey(property),
    )})))`;
  }

  return `${match}['${property.replace(new RegExp(`^${match}.`), '')}']`;
}

function getChartSqlFromMaterializedView({
  event,
  interval,
  startDate,
  endDate,
  projectId,
  timezone,
}: {
  event: IGetChartDataInput['event'];
  interval: IGetChartDataInput['interval'];
  startDate: string;
  endDate: string;
  projectId: string;
  timezone: string;
}): string {
  const { sb, getSelect, getWhere, getGroupBy, getOrderBy, getFill } =
    createSqlBuilder();

  // Use materialized view table with alias to avoid column name conflicts
  sb.from = 'events_daily_stats t';

  // Base filters (use table alias)
  sb.where.projectId = `t.project_id = ${sqlstring.escape(projectId)}`;
  if (event.name !== '*') {
    sb.where.eventName = `t.name = ${sqlstring.escape(event.name)}`;
  }
  sb.where.dateRange = `t.date >= toDate(${sqlstring.escape(startDate)}) AND t.date <= toDate(${sqlstring.escape(endDate)})`;

  // Label
  if (event.name !== '*') {
    sb.select.label_0 = `${sqlstring.escape(event.name)} as label_0`;
  } else {
    sb.select.label_0 = `'*' as label_0`;
  }

  // Count based on segment (use table alias)
  if (event.segment === 'user') {
    sb.select.count = 'uniqMerge(t.unique_profiles_state) as count';
  } else if (event.segment === 'session') {
    sb.select.count = 'uniqMerge(t.unique_sessions_state) as count';
  } else {
    sb.select.count = 'countMerge(t.event_count) as count';
  }

  // Date aggregation based on interval (use table alias)
  if (interval === 'day') {
    sb.select.date = 't.date';
    sb.groupBy.date = 't.date';
    sb.orderBy.date = 't.date ASC';
  } else if (interval === 'week') {
    sb.select.date = 'toStartOfWeek(t.date, 1) as date';
    sb.groupBy.date = 'toStartOfWeek(t.date, 1)';
    sb.orderBy.date = 'toStartOfWeek(t.date, 1) ASC';
  } else if (interval === 'month') {
    sb.select.date = 'toStartOfMonth(t.date) as date';
    sb.groupBy.date = 'toStartOfMonth(t.date)';
    sb.orderBy.date = 'toStartOfMonth(t.date) ASC';
  }

  // Build WITH FILL for date gaps
  let fillClause = '';
  if (interval === 'day') {
    fillClause = `WITH FILL FROM toDate(${sqlstring.escape(startDate)}) TO toDate(${sqlstring.escape(endDate)}) STEP toIntervalDay(1)`;
  } else if (interval === 'week') {
    fillClause = `WITH FILL FROM toStartOfWeek(toDate(${sqlstring.escape(startDate)}), 1) TO toStartOfWeek(toDate(${sqlstring.escape(endDate)}), 1) STEP toIntervalWeek(1)`;
  } else if (interval === 'month') {
    fillClause = `WITH FILL FROM toStartOfMonth(toDate(${sqlstring.escape(startDate)})) TO toStartOfMonth(toDate(${sqlstring.escape(endDate)})) STEP toIntervalMonth(1)`;
  }

  const sql = `${getSelect()} FROM ${sb.from} ${getWhere()} ${getGroupBy()} ${getOrderBy()} ${fillClause}`;

  console.log('-- Using Materialized View --');
  console.log(sql.replaceAll(/[\n\r]/g, ' '));
  console.log('-- End --');

  return sql;
}

function canUseMaterializedView(
  event: IGetChartDataInput['event'],
  breakdowns: IGetChartDataInput['breakdowns'],
  interval: IGetChartDataInput['interval'],
): boolean {
  // Can use MV if:
  // 1. Interval is day or larger (not hour/minute)
  // 2. No breakdowns OR single breakdown with no filters
  // 3. Segment is 'user' or 'session' or 'event'
  // 4. No complex property filters
  // 5. No cohort breakdowns
  const validIntervals = ['day', 'week', 'month'];
  const validSegments = ['user', 'session', 'event'];

  const hasCohortBreakdown = breakdowns.some(b => b.name.startsWith('cohort:'));
  if (hasCohortBreakdown) {
    return false;
  }

  return (
    validIntervals.includes(interval) &&
    validSegments.includes(event.segment ?? 'event') &&
    breakdowns.length === 0 &&
    (!event.filters || event.filters.length === 0) &&
    event.segment !== 'one_event_per_user'
  );
}

export async function getChartSql({
  event,
  breakdowns,
  interval,
  startDate,
  endDate,
  projectId,
  limit,
  timezone,
  chartType,
  customEvent,
}: IGetChartDataInput & {
  timezone: string;
  customEvent?: { name: string; definition: ICustomEventDefinition };
}) {
  // Pre-fetch cohort metadata for all cohorts used in this query (deduplicated)
  const cohortIdsSet = new Set<string>();

  // Extract cohort IDs from breakdowns
  breakdowns?.forEach((b) => {
    if (b.cohortId) {
      cohortIdsSet.add(b.cohortId);
    } else if (b.name.startsWith('cohort:')) {
      cohortIdsSet.add(b.name.split(':')[1]!);
    }
  });

  // Extract cohort IDs from event filters
  event.filters?.forEach((filter) => {
    if (filter.cohortId) {
      cohortIdsSet.add(filter.cohortId);
    }
  });

  // Extract cohort IDs from chart type filters
  chartType?.forEach((chart) => {
    chart.filters?.forEach((filter) => {
      if (filter.cohortId) {
        cohortIdsSet.add(filter.cohortId);
      }
    });
  });

  const cohortIds = Array.from(cohortIdsSet);

  // Fetch cohort metadata from Postgres (always fresh, no cache)
  const cohortMetadata = await fetchCohortsMetadata(cohortIds);

  // Check if we can use materialized view for fast queries
  // Custom events cannot use materialized views (for now)
  if (!customEvent && canUseMaterializedView(event, breakdowns, interval)) {
    return getChartSqlFromMaterializedView({
      event,
      interval,
      startDate,
      endDate,
      projectId,
      timezone,
    });
  }

  const {
    sb,
    join,
    getWhere,
    getFrom,
    getJoins,
    getSelect,
    getOrderBy,
    getGroupBy,
    getFill,
    getWith,
    with: addCte,
  } = createSqlBuilder();

  // Create CTEs for all cohorts (computed once per query, not per row)
  cohortIds.forEach((cohortId) => {
    const cohortMeta = cohortMetadata.get(cohortId);
    const cohortQuery = buildCohortMembershipQuery(cohortId, projectId, cohortMeta);
    addCte(getCohortCteName(cohortId), cohortQuery);
  });

  // Common setup
  sb.where = getEventFiltersWhereClause(event.filters, projectId);
  sb.where.projectId = `project_id = ${sqlstring.escape(projectId)}`;
  sb.select.label_0 =
    event.name !== '*'
      ? `${sqlstring.escape(event.name)} as label_0`
      : `'*' as label_0`;

  // Setup data source: custom event CTE or regular events table
  if (customEvent) {
    setupCustomEventCTE(sb, addCte, customEvent, projectId, startDate, endDate);
  } else if (event.name !== '*') {
    sb.where.eventName = `name = ${sqlstring.escape(event.name)}`;
  }

  const anyFilterOnProfile = event.filters.some((filter) =>
    filter.name.startsWith('profile.'),
  );
  const anyBreakdownOnProfile = breakdowns.some((breakdown) =>
    breakdown.name.startsWith('profile.'),
  );

  // Build WHERE clause without the bar filter (for use in subqueries and CTEs)
  // Define this early so we can use it in CTE definitions
  const getWhereWithoutBar = () => {
    const whereWithoutBar = { ...sb.where };
    delete whereWithoutBar.bar;
    return Object.keys(whereWithoutBar).length
      ? `WHERE ${join(whereWithoutBar, ' AND ')}`
      : '';
  };

  // Collect all profile fields used in filters and breakdowns
  // Extract top-level field names (e.g., 'properties' from 'profile.properties.os')
  const getProfileFields = () => {
    const fields = new Set<string>();

    // Always need id for the join
    fields.add('id');

    // Collect from filters
    event.filters
      .filter((f) => f.name.startsWith('profile.'))
      .forEach((f) => {
        const fieldName = f.name.replace('profile.', '').split('.')[0];
        if (fieldName && fieldName === 'properties') {
          fields.add('properties');
        } else if (
          fieldName &&
          ['email', 'first_name', 'last_name', 'created_at'].includes(fieldName)
        ) {
          fields.add(fieldName);
        }
      });

    // Collect from breakdowns
    breakdowns
      .filter((b) => b.name.startsWith('profile.'))
      .forEach((b) => {
        const fieldName = b.name.replace('profile.', '').split('.')[0];
        if (fieldName && fieldName === 'properties') {
          fields.add('properties');
        } else if (
          fieldName &&
          ['email', 'first_name', 'last_name', 'created_at'].includes(fieldName)
        ) {
          fields.add(fieldName);
        }
      });

    return Array.from(fields);
  };

  // Create profiles CTE if profiles are needed (to avoid duplicating the heavy profile join)
  // Only select the fields that are actually used
  const profilesJoinRef =
    anyFilterOnProfile || anyBreakdownOnProfile
      ? 'LEFT ANY JOIN profile ON profile.id = profile_id'
      : '';

  if (anyFilterOnProfile || anyBreakdownOnProfile) {
    const profileFields = getProfileFields();
    const selectFields = profileFields.map((field) => {
      // Keep original column names without aliases
      // so they can be accessed as profile.properties, profile.email, etc.
      return field;
    });

    // Add profiles CTE using the builder
    addCte(
      'profile',
      `SELECT ${selectFields.join(', ')}
      FROM ${TABLE_NAMES.profiles} FINAL
      WHERE project_id = ${sqlstring.escape(projectId)}`,
    );

    // Use the CTE reference in the main query
    sb.joins.profiles = profilesJoinRef;
  }

  sb.select.count = 'count(*) as count';
  switch (interval) {
    case 'minute': {
      sb.fill = `FROM toStartOfMinute(toDateTime('${startDate}')) TO toStartOfMinute(toDateTime('${endDate}')) STEP toIntervalMinute(1)`;
      sb.select.date = 'toStartOfMinute(created_at) as date';
      break;
    }
    case 'hour': {
      sb.fill = `FROM toStartOfHour(toDateTime('${startDate}')) TO toStartOfHour(toDateTime('${endDate}')) STEP toIntervalHour(1)`;
      sb.select.date = 'toStartOfHour(created_at) as date';
      break;
    }
    case 'day': {
      sb.fill = `FROM toStartOfDay(toDateTime('${startDate}')) TO toStartOfDay(toDateTime('${endDate}')) STEP toIntervalDay(1)`;
      sb.select.date = 'toStartOfDay(created_at) as date';
      break;
    }
    case 'week': {
      sb.fill = `FROM toStartOfWeek(toDateTime('${startDate}'), 1, '${timezone}') TO toStartOfWeek(toDateTime('${endDate}'), 1, '${timezone}') STEP toIntervalWeek(1)`;
      sb.select.date = `toStartOfWeek(created_at, 1, '${timezone}') as date`;
      break;
    }
    case 'month': {
      sb.fill = `FROM toStartOfMonth(toDateTime('${startDate}'), '${timezone}') TO toStartOfMonth(toDateTime('${endDate}'), '${timezone}') STEP toIntervalMonth(1)`;
      sb.select.date = `toStartOfMonth(created_at, '${timezone}') as date`;
      break;
    }
  }
  sb.groupBy.date = 'date';
  sb.orderBy.date = 'date ASC';

  if (startDate) {
    sb.where.startDate = `created_at >= toDateTime('${formatClickhouseDate(startDate)}')`;
  }

  if (endDate) {
    sb.where.endDate = `created_at <= toDateTime('${formatClickhouseDate(endDate)}')`;
  }

  // Use CTE to define top breakdown values once, then reference in WHERE clause
  if (breakdowns.length > 0 && limit) {
    const breakdownSelects = breakdowns
      .map((b) => getSelectPropertyKey(b.name, projectId, b.cohortId))
      .join(', ');

    // Add top_breakdowns CTE using the builder
    addCte(
      'top_breakdowns',
      `SELECT ${breakdownSelects}
      FROM ${TABLE_NAMES.events} e
      ${profilesJoinRef ? `${profilesJoinRef} ` : ''}${getWhereWithoutBar()}
      GROUP BY ${breakdownSelects}
      ORDER BY count(*) DESC
      LIMIT ${limit}`,
    );

    // Filter main query to only include top breakdown values
    sb.where.bar = `(${breakdowns.map((b) => getSelectPropertyKey(b.name, projectId, b.cohortId)).join(',')}) IN (SELECT * FROM top_breakdowns)`;
  }

  breakdowns.forEach((breakdown, index) => {
    // Breakdowns start at label_1 (label_0 is reserved for event name)
    const key = `label_${index + 1}`;
    sb.select[key] = `${getSelectPropertyKey(breakdown.name, projectId, breakdown.cohortId)} as ${key}`;
    sb.groupBy[key] = `${key}`;
  });

  if (event.segment === 'user') {
    sb.select.count = 'uniq(profile_id) as count';
  }

  if (event.segment === 'session') {
    sb.select.count = 'uniq(session_id) as count';
  }

  if (event.segment === 'user_average') {
    sb.select.count =
      'COUNT(*)::float / COUNT(DISTINCT profile_id)::float as count';
  }

  const mathFunction = {
    property_sum: 'sum',
    property_average: 'avg',
    property_max: 'max',
    property_min: 'min',
  }[event.segment as string];

  if (mathFunction && event.property) {
    const propertyKey = getSelectPropertyKey(event.property, projectId);

    if (isNumericColumn(event.property)) {
      sb.select.count = `${mathFunction}(${propertyKey}) as count`;
      sb.where.property = `${propertyKey} IS NOT NULL`;
    } else {
      sb.select.count = `${mathFunction}(toFloat64OrNull(${propertyKey})) as count`;
      sb.where.property = `${propertyKey} IS NOT NULL AND notEmpty(${propertyKey})`;
    }
  }

  if (event.segment === 'one_event_per_user') {
    sb.from = `(
      SELECT DISTINCT ON (profile_id) * from ${TABLE_NAMES.events} ${getJoins()} WHERE ${join(
        sb.where,
        ' AND ',
      )}
        ORDER BY profile_id, created_at DESC
      ) as subQuery`;
    sb.joins = {};

    const sql = `${getWith()}${getSelect()} ${getFrom()} ${getJoins()} ${getWhere()} ${getGroupBy()} ${getOrderBy()} ${getFill()}`;
    console.log('-- Report --');
    console.log(sql.replaceAll(/[\n\r]/g, ' '));
    console.log('-- End --');
    return sql;
  }

  if (breakdowns.length > 0) {
    const breakdownSelects = breakdowns
      .map((b, index) => {
        const propertyKey = getSelectPropertyKey(b.name, projectId, b.cohortId);
        return `${propertyKey} as breakdown_${index + 1}`;
      })
      .join(', ');

    const breakdownGroupBy = breakdowns
      .map((b, index) => `breakdown_${index + 1}`)
      .join(', ');

    const totalCountWhere = getWhereWithoutBar();

    addCte(
      'breakdown_totals',
      `SELECT
        ${breakdownSelects},
        uniq(profile_id) as total_count
       FROM ${TABLE_NAMES.events}
       ${profilesJoinRef ? `${profilesJoinRef} ` : ''}${totalCountWhere}
       GROUP BY ${breakdownGroupBy}`,
    );

    const joinConditions = breakdowns
      .map((b, index) => {
        const propertyKey = getSelectPropertyKey(b.name, projectId, b.cohortId);
        return `breakdown_totals.breakdown_${index + 1} = ${propertyKey}`;
      })
      .join(' AND ');

    sb.joins.breakdown_totals = `LEFT JOIN breakdown_totals ON ${joinConditions}`;
    sb.select.total_unique_count = `any(breakdown_totals.total_count) as total_count`;
  } else {
    const totalCountWhere = getWhereWithoutBar();

    addCte(
      'total_unique',
      `SELECT uniq(profile_id) as total_count
       FROM ${TABLE_NAMES.events}
       ${profilesJoinRef ? `${profilesJoinRef} ` : ''}${totalCountWhere}`,
    );

    sb.select.total_unique_count = `(SELECT total_count FROM total_unique) as total_count`;
  }

  const sql = `${getWith()}${getSelect()} ${getFrom()} ${getJoins()} ${getWhere()} ${getGroupBy()} ${getOrderBy()} ${getFill()}`;
  console.log('-- Report --');
  console.log(sql.replaceAll(/[\n\r]/g, ' '));
  console.log('-- End --');
  return sql;
}

function isNumericColumn(columnName: string): boolean {
  const numericColumns = ['duration', 'revenue', 'longitude', 'latitude'];
  return numericColumns.includes(columnName);
}

/**
 * Setup CTE for custom event expansion
 * Modifies the sql builder to use custom event data instead of events table
 */
function setupCustomEventCTE(
  sb: any,
  addCte: (name: string, query: string) => void,
  customEvent: { name: string; definition: ICustomEventDefinition },
  projectId: string,
  startDate: string,
  endDate: string,
) {
  const baseWhere: string[] = [];
  if (startDate) {
    baseWhere.push(`created_at >= toDateTime('${formatClickhouseDate(startDate)}')`);
  }
  if (endDate) {
    baseWhere.push(`created_at <= toDateTime('${formatClickhouseDate(endDate)}')`);
  }

  const customEventSQL = expandCustomEventToSQL(
    { ...customEvent, projectId },
    baseWhere,
  );

  addCte('custom_event_data', customEventSQL);
  sb.from = 'custom_event_data';
}

export function getEventFiltersWhereClause(
  filters: IChartEventFilter[],
  projectId?: string,
) {
  const where: Record<string, string> = {};
  filters.forEach((filter, index) => {
    const id = `f${index}`;
    const { name, value, operator, cohortId } = filter;

    // Handle cohort operators
    if (operator === 'inCohort' && cohortId && projectId) {
      const subquery = getCohortMembershipSubquery(cohortId);
      where[id] = `profile_id IN (${subquery})`;
      return;
    }

    if (operator === 'notInCohort' && cohortId && projectId) {
      const subquery = getCohortMembershipSubquery(cohortId);
      where[id] = `profile_id NOT IN (${subquery})`;
      return;
    }

    if (
      value.length === 0 &&
      operator !== 'isNull' &&
      operator !== 'isNotNull'
    ) {
      return;
    }

    if (name === 'has_profile') {
      if (value.includes('true')) {
        where[id] = 'profile_id != device_id';
      } else {
        where[id] = 'profile_id = device_id';
      }
      return;
    }

    if (
      name.startsWith('properties.') ||
      name.startsWith('profile.properties.')
    ) {
      const propertyKey = getSelectPropertyKey(name, projectId);
      const isWildcard = propertyKey.includes('%');
      const whereFrom = getSelectPropertyKey(name, projectId);

      switch (operator) {
        case 'is': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x = ${sqlstring.escape(String(val).trim())}`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            if (value.length === 1) {
              where[id] =
                `${whereFrom} = ${sqlstring.escape(String(value[0]).trim())}`;
            } else {
              where[id] = `${whereFrom} IN (${value
                .map((val) => sqlstring.escape(String(val).trim()))
                .join(', ')})`;
            }
          }
          break;
        }
        case 'isNot': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x != ${sqlstring.escape(String(val).trim())}`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            if (value.length === 1) {
              where[id] =
                `${whereFrom} != ${sqlstring.escape(String(value[0]).trim())}`;
            } else {
              where[id] = `${whereFrom} NOT IN (${value
                .map((val) => sqlstring.escape(String(val).trim()))
                .join(', ')})`;
            }
          }
          break;
        }
        case 'contains': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) =>
                  `x LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`,
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'doesNotContain': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) =>
                  `x NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`,
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'startsWith': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) => `x LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`,
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'endsWith': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) => `x LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`,
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'regex': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `match(x, ${sqlstring.escape(String(val).trim())})`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `match(${whereFrom}, ${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'isNull': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> x = '' OR x IS NULL, ${whereFrom})`;
          } else {
            where[id] = `(${whereFrom} = '' OR ${whereFrom} IS NULL)`;
          }
          break;
        }
        case 'isNotNull': {
          if (isWildcard) {
            where[id] =
              `arrayExists(x -> x != '' AND x IS NOT NULL, ${whereFrom})`;
          } else {
            where[id] = `(${whereFrom} != '' AND ${whereFrom} IS NOT NULL)`;
          }
          break;
        }
        case 'gt': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) =>
                  `toFloat64OrZero(x) > toFloat64(${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64OrZero(${whereFrom}) > toFloat64(${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'lt': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) =>
                  `toFloat64OrZero(x) < toFloat64(${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64OrZero(${whereFrom}) < toFloat64(${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'gte': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) =>
                  `toFloat64OrZero(x) >= toFloat64(${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64OrZero(${whereFrom}) >= toFloat64(${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'lte': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) =>
                  `toFloat64OrZero(x) <= toFloat64(${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64OrZero(${whereFrom}) <= toFloat64(${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')})`;
          }
          break;
        }
      }
    } else {
      switch (operator) {
        case 'is': {
          if (value.length === 1) {
            where[id] =
              `${name} = ${sqlstring.escape(String(value[0]).trim())}`;
          } else {
            where[id] = `${name} IN (${value
              .map((val) => sqlstring.escape(String(val).trim()))
              .join(', ')})`;
          }
          break;
        }
        case 'isNull': {
          where[id] = `(${name} = '' OR ${name} IS NULL)`;
          break;
        }
        case 'isNotNull': {
          where[id] = `(${name} != '' AND ${name} IS NOT NULL)`;
          break;
        }
        case 'isNot': {
          if (value.length === 1) {
            where[id] =
              `${name} != ${sqlstring.escape(String(value[0]).trim())}`;
          } else {
            where[id] = `${name} NOT IN (${value
              .map((val) => sqlstring.escape(String(val).trim()))
              .join(', ')})`;
          }
          break;
        }
        case 'contains': {
          where[id] = `(${value
            .map(
              (val) =>
                `${name} LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`,
            )
            .join(' OR ')})`;
          break;
        }
        case 'doesNotContain': {
          where[id] = `(${value
            .map(
              (val) =>
                `${name} NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`,
            )
            .join(' OR ')})`;
          break;
        }
        case 'startsWith': {
          where[id] = `(${value
            .map(
              (val) =>
                `${name} LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`,
            )
            .join(' OR ')})`;
          break;
        }
        case 'endsWith': {
          where[id] = `(${value
            .map(
              (val) =>
                `${name} LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`,
            )
            .join(' OR ')})`;
          break;
        }
        case 'regex': {
          where[id] = `(${value
            .map(
              (val) =>
                `match(${name}, ${sqlstring.escape(stripLeadingAndTrailingSlashes(String(val)).trim())})`,
            )
            .join(' OR ')})`;
          break;
        }
        case 'gt': {
          if (isNumericColumn(name)) {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64(${name}) > toFloat64(${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')})`;
          } else {
            where[id] = `(${value
              .map((val) => `${name} > ${sqlstring.escape(String(val).trim())}`)
              .join(' OR ')})`;
          }
          break;
        }
        case 'lt': {
          if (isNumericColumn(name)) {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64(${name}) < toFloat64(${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')})`;
          } else {
            where[id] = `(${value
              .map((val) => `${name} < ${sqlstring.escape(String(val).trim())}`)
              .join(' OR ')})`;
          }
          break;
        }
        case 'gte': {
          if (isNumericColumn(name)) {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64(${name}) >= toFloat64(${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')})`;
          } else {
            where[id] = `(${value
              .map(
                (val) => `${name} >= ${sqlstring.escape(String(val).trim())}`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'lte': {
          if (isNumericColumn(name)) {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64(${name}) <= toFloat64(${sqlstring.escape(String(val).trim())})`,
              )
              .join(' OR ')})`;
          } else {
            where[id] = `(${value
              .map(
                (val) => `${name} <= ${sqlstring.escape(String(val).trim())}`,
              )
              .join(' OR ')})`;
          }
          break;
        }
      }
    }
  });

  return where;
}

/**
 * Generate WHERE clause for global cohort filters
 * These filters apply to the entire chart, not just specific events
 */
export function getGlobalCohortFiltersWhereClause(
  cohortFilters: Array<{ cohortId: string; operator: 'inCohort' | 'notInCohort' }>,
  projectId: string,
): string {
  if (!cohortFilters || cohortFilters.length === 0) {
    return '';
  }

  const conditions = cohortFilters.map((filter) => {
    const subquery = getCohortMembershipSubquery(filter.cohortId);

    return filter.operator === 'inCohort'
      ? `profile_id IN (${subquery})`
      : `profile_id NOT IN (${subquery})`;
  });

  // AND logic between multiple cohort filters
  return conditions.join(' AND ');
}

export function getChartStartEndDate(
  {
    startDate,
    endDate,
    range,
  }: Pick<IChartInput, 'endDate' | 'startDate' | 'range'>,
  timezone: string,
) {
  if (startDate && endDate) {
    return { startDate: startDate, endDate: endDate };
  }

  const ranges = getDatesFromRange(range, timezone);
  if (!startDate && endDate) {
    return { startDate: ranges.startDate, endDate: endDate };
  }

  return ranges;
}

export function getDatesFromRange(range: IChartRange, timezone: string) {
  if (range === '30min' || range === 'lastHour') {
    const minutes = range === '30min' ? 30 : 60;
    const startDate = DateTime.now()
      .minus({ minute: minutes })
      .startOf('minute')
      .setZone(timezone)
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('minute')
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === 'today') {
    const startDate = DateTime.now()
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === 'yesterday') {
    const startDate = DateTime.now()
      .minus({ day: 1 })
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .minus({ day: 1 })
      .setZone(timezone)
      .endOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === '7d') {
    const startDate = DateTime.now()
      .minus({ day: 7 })
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === '6m') {
    const startDate = DateTime.now()
      .minus({ month: 6 })
      .setZone(timezone)
      .startOf('day')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === '12m') {
    const startDate = DateTime.now()
      .minus({ month: 12 })
      .setZone(timezone)
      .startOf('month')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('month')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === 'monthToDate') {
    const startDate = DateTime.now()
      .setZone(timezone)
      .startOf('month')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === 'lastMonth') {
    const month = DateTime.now()
      .minus({ month: 1 })
      .setZone(timezone)
      .startOf('month');

    const startDate = month.toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = month
      .endOf('month')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === 'yearToDate') {
    const startDate = DateTime.now()
      .setZone(timezone)
      .startOf('year')
      .toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = DateTime.now()
      .setZone(timezone)
      .endOf('day')
      .plus({ millisecond: 1 })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  if (range === 'lastYear') {
    const year = DateTime.now().minus({ year: 1 }).setZone(timezone);
    const startDate = year.startOf('year').toFormat('yyyy-MM-dd HH:mm:ss');
    const endDate = year.endOf('year').toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      startDate: startDate,
      endDate: endDate,
    };
  }

  // range === '30d'
  const startDate = DateTime.now()
    .minus({ day: 30 })
    .setZone(timezone)
    .startOf('day')
    .toFormat('yyyy-MM-dd HH:mm:ss');
  const endDate = DateTime.now()
    .setZone(timezone)
    .endOf('day')
    .plus({ millisecond: 1 })
    .toFormat('yyyy-MM-dd HH:mm:ss');

  return {
    startDate: startDate,
    endDate: endDate,
  };
}

export function getChartPrevStartEndDate({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  let diff = DateTime.fromFormat(endDate, 'yyyy-MM-dd HH:mm:ss').diff(
    DateTime.fromFormat(startDate, 'yyyy-MM-dd HH:mm:ss'),
  );

  // this will make sure our start and end date's are correct
  // otherwise if a day ends with 23:59:59.999 and starts with 00:00:00.000
  // the diff will be 23:59:59.999 and that will make the start date wrong
  // so we add 1 millisecond to the diff
  if ((diff.milliseconds / 1000) % 2 !== 0) {
    diff = diff.plus({ millisecond: 1 });
  }

  return {
    startDate: DateTime.fromFormat(startDate, 'yyyy-MM-dd HH:mm:ss')
      .minus({ millisecond: diff.milliseconds })
      .toFormat('yyyy-MM-dd HH:mm:ss'),
    endDate: DateTime.fromFormat(endDate, 'yyyy-MM-dd HH:mm:ss')
      .minus({ millisecond: diff.milliseconds })
      .toFormat('yyyy-MM-dd HH:mm:ss'),
  };
}
