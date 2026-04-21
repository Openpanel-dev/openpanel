/** biome-ignore-all lint/style/useDefaultSwitchClause: switch cases are exhaustive by design */
import { stripLeadingAndTrailingSlashes } from '@openpanel/common';
import type {
  CohortDefinition,
  IChartBreakdown,
  IChartEventFilter,
  IGetChartDataInput,
  IReportInput,
} from '@openpanel/validation';
import sqlstring from 'sqlstring';
import { formatClickhouseDate, TABLE_NAMES } from '../clickhouse/client';
import { db } from '../prisma-client';
import { createSqlBuilder } from '../sql-builder';

export type CohortMetadata = {
  id: string;
  name: string;
};

export async function fetchCohortsMetadata(
  cohortIds: string[],
): Promise<Map<string, CohortMetadata>> {
  if (cohortIds.length === 0) {
    return new Map();
  }

  const cohorts = await db.cohort.findMany({
    where: { id: { in: cohortIds } },
    select: { id: true, name: true },
  });

  return new Map(
    cohorts.map((c) => [c.id, { id: c.id, name: c.name }]),
  );
}

export function getCohortCteName(cohortId: string): string {
  return `\`cohort-${cohortId}\``;
}

export function getCohortAlias(cohortId: string): string {
  return `cohort_${cohortId.replace(/-/g, '_')}`;
}

export function buildCohortMembershipQuery(
  cohortId: string,
  projectId: string,
): string {
  return `
    SELECT profile_id
    FROM ${TABLE_NAMES.cohort_members} FINAL
    WHERE cohort_id = ${sqlstring.escape(cohortId)}
      AND project_id = ${sqlstring.escape(projectId)}
  `;
}

export function buildInlineCohortJoin(
  cohortId: string,
  projectId: string,
  tableAlias: string,
): string {
  const cohortAlias = getCohortAlias(cohortId);
  const cohortQuery = buildCohortMembershipQuery(cohortId, projectId);
  return `LEFT ANY JOIN (${cohortQuery}) AS ${cohortAlias} ON ${cohortAlias}.profile_id = ${tableAlias}.profile_id`;
}

export function extractCohortId(breakdownName: string): string | null {
  if (breakdownName.startsWith('cohort:')) {
    return breakdownName.split(':')[1] ?? null;
  }
  return null;
}

export function collectCohortIds(
  filters: IChartEventFilter[],
  breakdowns: IChartBreakdown[],
): string[] {
  const ids = new Set<string>();
  for (const filter of filters) {
    if (filter.cohortId) {
      ids.add(filter.cohortId);
    }
  }
  for (const breakdown of breakdowns) {
    const id = extractCohortId(breakdown.name);
    if (id) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}

export function transformPropertyKey(property: string) {
  const propertyPatterns = ['properties', 'profile.properties'];
  const match = propertyPatterns.find((pattern) =>
    property.startsWith(`${pattern}.`)
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

// Returns a SQL expression for a group property via the _g JOIN alias
// property format: "group.name", "group.type", "group.properties.plan"
export function getGroupPropertySql(property: string): string {
  const withoutPrefix = property.replace(/^group\./, '');
  if (withoutPrefix === 'name') {
    return '_g.name';
  }
  if (withoutPrefix === 'type') {
    return '_g.type';
  }
  if (withoutPrefix.startsWith('properties.')) {
    const propKey = withoutPrefix.replace(/^properties\./, '');
    return `_g.properties[${sqlstring.escape(propKey)}]`;
  }
  return '_group_id';
}

// Returns the SELECT expression when querying the groups table directly (no join alias).
// Use for fetching distinct values for group.* properties.
export function getGroupPropertySelect(property: string): string {
  const withoutPrefix = property.replace(/^group\./, '');
  if (withoutPrefix === 'name') {
    return 'name';
  }
  if (withoutPrefix === 'type') {
    return 'type';
  }
  if (withoutPrefix === 'id') {
    return 'id';
  }
  if (withoutPrefix.startsWith('properties.')) {
    const propKey = withoutPrefix.replace(/^properties\./, '');
    return `properties[${sqlstring.escape(propKey)}]`;
  }
  return 'id';
}

// Returns the SELECT expression when querying the profiles table directly (no join alias).
// Use for fetching distinct values for profile.* properties.
export function getProfilePropertySelect(property: string): string {
  const withoutPrefix = property.replace(/^profile\./, '');
  if (withoutPrefix === 'id') {
    return 'id';
  }
  if (withoutPrefix === 'first_name') {
    return 'first_name';
  }
  if (withoutPrefix === 'last_name') {
    return 'last_name';
  }
  if (withoutPrefix === 'email') {
    return 'email';
  }
  if (withoutPrefix === 'avatar') {
    return 'avatar';
  }
  if (withoutPrefix.startsWith('properties.')) {
    const propKey = withoutPrefix.replace(/^properties\./, '');
    return `properties[${sqlstring.escape(propKey)}]`;
  }
  return 'id';
}

export function getSelectPropertyKey(
  property: string,
  projectId?: string,
  cohortId?: string,
  cohortName?: string,
) {
  const extractedCohortId = cohortId || extractCohortId(property);

  if (extractedCohortId && projectId) {
    const cohortAlias = getCohortAlias(extractedCohortId);
    const inLabel = cohortName
      ? sqlstring.escape(cohortName)
      : "'In Cohort'";
    const notInLabel = cohortName
      ? sqlstring.escape(`Not ${cohortName}`)
      : "'Not In Cohort'";
    return `if(notEmpty(${cohortAlias}.profile_id), ${inLabel}, ${notInLabel})`;
  }

  if (property === 'has_profile') {
    return `if(profile_id != device_id, 'true', 'false')`;
  }

  // Handle group properties — requires ARRAY JOIN + _g JOIN to be present in query
  if (property.startsWith('group.') && projectId) {
    return getGroupPropertySql(property);
  }

  const propertyPatterns = ['properties', 'profile.properties'];

  const match = propertyPatterns.find((pattern) =>
    property.startsWith(`${pattern}.`)
  );
  if (!match) {
    return property;
  }

  if (property.includes('*')) {
    return `arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(${match}, ${sqlstring.escape(
      transformPropertyKey(property)
    )})))`;
  }

  return `${match}['${property.replace(new RegExp(`^${match}.`), '')}']`;
}

export async function getChartSql({
  event,
  breakdowns,
  interval,
  startDate,
  endDate,
  projectId,
  timezone,
}: IGetChartDataInput & { timezone: string }) {
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

  const cohortIds = collectCohortIds(event.filters, breakdowns);
  const cohortMetadata = await fetchCohortsMetadata(cohortIds);

  for (const cohortId of cohortIds) {
    addCte(
      getCohortCteName(cohortId),
      buildCohortMembershipQuery(cohortId, projectId),
    );
    sb.joins[`cohort_${cohortId}`] =
      `LEFT ANY JOIN ${getCohortCteName(cohortId)} AS ${getCohortAlias(cohortId)} ON ${getCohortAlias(cohortId)}.profile_id = e.profile_id`;
  }

  sb.where = getEventFiltersWhereClause(event.filters, projectId);
  sb.where.projectId = `project_id = ${sqlstring.escape(projectId)}`;

  if (event.name !== '*') {
    sb.select.label_0 = `${sqlstring.escape(event.name)} as label_0`;
    sb.where.eventName = `e.name = ${sqlstring.escape(event.name)}`;
  } else {
    sb.select.label_0 = `'*' as label_0`;
  }

  const anyFilterOnProfile = event.filters.some((filter) =>
    filter.name.startsWith('profile.')
  );
  const anyBreakdownOnProfile = breakdowns.some((breakdown) =>
    breakdown.name.startsWith('profile.')
  );
  const anyFilterOnGroup = event.filters.some((filter) =>
    filter.name.startsWith('group.')
  );
  const anyBreakdownOnGroup = breakdowns.some((breakdown) =>
    breakdown.name.startsWith('group.')
  );
  const anyMetricOnGroup = !!event.property?.startsWith('group.');
  const needsGroupArrayJoin =
    anyFilterOnGroup ||
    anyBreakdownOnGroup ||
    anyMetricOnGroup ||
    event.segment === 'group';

  if (needsGroupArrayJoin) {
    addCte(
      '_g',
      `SELECT id, name, type, properties FROM ${TABLE_NAMES.groups} FINAL WHERE project_id = ${sqlstring.escape(projectId)}`
    );
    sb.joins.groups = 'ARRAY JOIN groups AS _group_id';
    sb.joins.groups_table = 'LEFT ANY JOIN _g ON _g.id = _group_id';
  }

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
          ['email', 'first_name', 'last_name'].includes(fieldName)
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
          ['email', 'first_name', 'last_name'].includes(fieldName)
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
      if (field === 'id') {
        return 'id as "profile.id"';
      }
      if (field === 'properties') {
        return 'properties as "profile.properties"';
      }
      if (field === 'email') {
        return 'email as "profile.email"';
      }
      if (field === 'first_name') {
        return 'first_name as "profile.first_name"';
      }
      if (field === 'last_name') {
        return 'last_name as "profile.last_name"';
      }
      return field;
    });

    // Add profiles CTE using the builder
    addCte(
      'profile',
      `SELECT ${selectFields.join(', ')}
      FROM ${TABLE_NAMES.profiles} FINAL
      WHERE project_id = ${sqlstring.escape(projectId)}`
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

  breakdowns.forEach((breakdown, index) => {
    // Breakdowns start at label_1 (label_0 is reserved for event name)
    const key = `label_${index + 1}`;
    const breakdownCohortId = extractCohortId(breakdown.name);
    const breakdownCohortName = breakdownCohortId
      ? cohortMetadata.get(breakdownCohortId)?.name
      : undefined;
    sb.select[key] =
      `${getSelectPropertyKey(breakdown.name, projectId, breakdownCohortId ?? undefined, breakdownCohortName)} as ${key}`;
    sb.groupBy[key] = `${key}`;
  });

  if (event.segment === 'user') {
    sb.select.count = 'countDistinct(profile_id) as count';
  }

  if (event.segment === 'session') {
    sb.select.count = 'countDistinct(session_id) as count';
  }

  if (event.segment === 'group') {
    sb.select.count = 'countDistinct(_group_id) as count';
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
    const propertyKey = getSelectPropertyKey(event.property);

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
      SELECT DISTINCT ON (profile_id) * from ${TABLE_NAMES.events} e ${getJoins()} WHERE ${join(
        sb.where,
        ' AND '
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

  // Note: The profile CTE (if it exists) is available in subqueries, so we can reference it directly.
  // Cohort CTEs cannot be referenced from nested CTEs in ClickHouse, so we inline them.
  const subqueryGroupJoins = needsGroupArrayJoin
    ? 'ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id '
    : '';
  const inlineCohortJoinsSql = cohortIds
    .map((id) => buildInlineCohortJoin(id, projectId, 'e'))
    .join(' ');

  if (breakdowns.length > 0) {
    // Pre-compute unique counts per breakdown group in a CTE, then JOIN it.
    // We can't use a correlated subquery because:
    // 1. ClickHouse expands label_X aliases to their underlying expressions,
    //    which resolve in the subquery's scope, making the condition a tautology.
    // 2. Correlated subqueries aren't supported on distributed/remote tables.
    const ucSelectParts: string[] = breakdowns.map((breakdown, index) => {
      const bId = extractCohortId(breakdown.name);
      const bName = bId ? cohortMetadata.get(bId)?.name : undefined;
      const propertyKey = getSelectPropertyKey(
        breakdown.name,
        projectId,
        bId ?? undefined,
        bName,
      );
      return `${propertyKey} as _uc_label_${index + 1}`;
    });
    ucSelectParts.push('uniq(profile_id) as total_count');

    const ucGroupByParts = breakdowns.map(
      (_, index) => `_uc_label_${index + 1}`
    );

    const ucWhere = getWhereWithoutBar();

    addCte(
      '_uc',
      `SELECT ${ucSelectParts.join(', ')} FROM ${TABLE_NAMES.events} e ${subqueryGroupJoins}${profilesJoinRef ? `${profilesJoinRef} ` : ''}${inlineCohortJoinsSql ? `${inlineCohortJoinsSql} ` : ''}${ucWhere} GROUP BY ${ucGroupByParts.join(', ')}`
    );

    const ucJoinConditions = breakdowns
      .map((b, index) => {
        const bId = extractCohortId(b.name);
        const bName = bId ? cohortMetadata.get(bId)?.name : undefined;
        const propertyKey = getSelectPropertyKey(
          b.name,
          projectId,
          bId ?? undefined,
          bName,
        );
        return `_uc._uc_label_${index + 1} = ${propertyKey}`;
      })
      .join(' AND ');

    sb.joins.unique_counts = `LEFT ANY JOIN _uc ON ${ucJoinConditions}`;
    sb.select.total_unique_count = 'any(_uc.total_count) as total_count';
  } else {
    const ucWhere = getWhereWithoutBar();

    addCte(
      '_uc',
      `SELECT uniq(profile_id) as total_count FROM ${TABLE_NAMES.events} e ${subqueryGroupJoins}${profilesJoinRef ? `${profilesJoinRef} ` : ''}${inlineCohortJoinsSql ? `${inlineCohortJoinsSql} ` : ''}${ucWhere}`
    );

    sb.select.total_unique_count =
      '(SELECT total_count FROM _uc) as total_count';
  }

  const sql = `${getWith()}${getSelect()} ${getFrom()} ${getJoins()} ${getWhere()} ${getGroupBy()} ${getOrderBy()} ${getFill()}`;
  console.log('-- Report --');
  console.log(sql.replaceAll(/[\n\r]/g, ' '));
  console.log('-- End --');
  return sql;
}

export async function getAggregateChartSql({
  event,
  breakdowns,
  startDate,
  endDate,
  projectId,
  limit,
}: Omit<IGetChartDataInput, 'interval' | 'chartType'> & {
  timezone: string;
}) {
  const { sb, join, getJoins, with: addCte, getSql } = createSqlBuilder();

  const cohortIds = collectCohortIds(event.filters, breakdowns);
  const cohortMetadata = await fetchCohortsMetadata(cohortIds);

  for (const cohortId of cohortIds) {
    addCte(
      getCohortCteName(cohortId),
      buildCohortMembershipQuery(cohortId, projectId),
    );
    sb.joins[`cohort_${cohortId}`] =
      `LEFT ANY JOIN ${getCohortCteName(cohortId)} AS ${getCohortAlias(cohortId)} ON ${getCohortAlias(cohortId)}.profile_id = e.profile_id`;
  }

  sb.where = getEventFiltersWhereClause(event.filters, projectId);
  sb.where.projectId = `project_id = ${sqlstring.escape(projectId)}`;

  if (event.name !== '*') {
    sb.select.label_0 = `${sqlstring.escape(event.name)} as label_0`;
    sb.where.eventName = `e.name = ${sqlstring.escape(event.name)}`;
  } else {
    sb.select.label_0 = `'*' as label_0`;
  }

  const anyFilterOnProfile = event.filters.some((filter) =>
    filter.name.startsWith('profile.')
  );
  const anyBreakdownOnProfile = breakdowns.some((breakdown) =>
    breakdown.name.startsWith('profile.')
  );
  const anyFilterOnGroup = event.filters.some((filter) =>
    filter.name.startsWith('group.')
  );
  const anyBreakdownOnGroup = breakdowns.some((breakdown) =>
    breakdown.name.startsWith('group.')
  );
  const anyMetricOnGroup = !!event.property?.startsWith('group.');
  const needsGroupArrayJoin =
    anyFilterOnGroup ||
    anyBreakdownOnGroup ||
    anyMetricOnGroup ||
    event.segment === 'group';

  if (needsGroupArrayJoin) {
    addCte(
      '_g',
      `SELECT id, name, type, properties FROM ${TABLE_NAMES.groups} FINAL WHERE project_id = ${sqlstring.escape(projectId)}`
    );
    sb.joins.groups = 'ARRAY JOIN groups AS _group_id';
    sb.joins.groups_table = 'LEFT ANY JOIN _g ON _g.id = _group_id';
  }

  // Collect all profile fields used in filters and breakdowns
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
          ['email', 'first_name', 'last_name'].includes(fieldName)
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
          ['email', 'first_name', 'last_name'].includes(fieldName)
        ) {
          fields.add(fieldName);
        }
      });

    return Array.from(fields);
  };

  // Create profiles CTE if profiles are needed
  const profilesJoinRef =
    anyFilterOnProfile || anyBreakdownOnProfile
      ? 'LEFT ANY JOIN profile ON profile.id = profile_id'
      : '';

  if (anyFilterOnProfile || anyBreakdownOnProfile) {
    const profileFields = getProfileFields();
    const selectFields = profileFields.map((field) => {
      if (field === 'id') {
        return 'id as "profile.id"';
      }
      if (field === 'properties') {
        return 'properties as "profile.properties"';
      }
      if (field === 'email') {
        return 'email as "profile.email"';
      }
      if (field === 'first_name') {
        return 'first_name as "profile.first_name"';
      }
      if (field === 'last_name') {
        return 'last_name as "profile.last_name"';
      }
      return field;
    });

    addCte(
      'profile',
      `SELECT ${selectFields.join(', ')}
      FROM ${TABLE_NAMES.profiles} FINAL
      WHERE project_id = ${sqlstring.escape(projectId)}`
    );

    sb.joins.profiles = profilesJoinRef;
  }

  // Date range filters
  if (startDate) {
    sb.where.startDate = `created_at >= toDateTime('${formatClickhouseDate(startDate)}')`;
  }

  if (endDate) {
    sb.where.endDate = `created_at <= toDateTime('${formatClickhouseDate(endDate)}')`;
  }

  // Add a constant date field for aggregate charts (groupByLabels expects it)
  // Use startDate as the date value since we're aggregating across the entire range
  sb.select.date = `${sqlstring.escape(startDate)} as date`;

  // Add breakdowns to SELECT and GROUP BY
  breakdowns.forEach((breakdown, index) => {
    // Breakdowns start at label_1 (label_0 is reserved for event name)
    const key = `label_${index + 1}`;
    const breakdownCohortId = extractCohortId(breakdown.name);
    const breakdownCohortName = breakdownCohortId
      ? cohortMetadata.get(breakdownCohortId)?.name
      : undefined;
    sb.select[key] =
      `${getSelectPropertyKey(breakdown.name, projectId, breakdownCohortId ?? undefined, breakdownCohortName)} as ${key}`;
    sb.groupBy[key] = `${key}`;
  });

  // Always group by label_0 (event name) for aggregate charts
  sb.groupBy.label_0 = 'label_0';

  // Default count aggregation
  sb.select.count = 'count(*) as count';

  // Handle different segments
  if (event.segment === 'user') {
    sb.select.count = 'countDistinct(profile_id) as count';
  }

  if (event.segment === 'session') {
    sb.select.count = 'countDistinct(session_id) as count';
  }

  if (event.segment === 'group') {
    sb.select.count = 'countDistinct(_group_id) as count';
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
      SELECT DISTINCT ON (profile_id) * from ${TABLE_NAMES.events} e ${getJoins()} WHERE ${join(
        sb.where,
        ' AND '
      )}
        ORDER BY profile_id, created_at DESC
      ) as subQuery`;
    sb.joins = {};

    const sql = getSql();
    console.log('-- Aggregate Chart --');
    console.log(sql.replaceAll(/[\n\r]/g, ' '));
    console.log('-- End --');
    return sql;
  }

  // Order by count DESC (biggest first) for aggregate charts
  sb.orderBy.count = 'count DESC';

  // Apply limit if specified
  if (limit) {
    sb.limit = limit;
  }

  const sql = getSql();
  console.log('-- Aggregate Chart --');
  console.log(sql.replaceAll(/[\n\r]/g, ' '));
  console.log('-- End --');
  return sql;
}

function isNumericColumn(columnName: string): boolean {
  const numericColumns = ['duration', 'revenue', 'longitude', 'latitude'];
  return numericColumns.includes(columnName);
}

export function getEventFiltersWhereClause(
  filters: IChartEventFilter[],
  projectId?: string
) {
  const where: Record<string, string> = {};
  filters.forEach((filter, index) => {
    const id = `f${index}`;
    const { name, value, operator, cohortId } = filter;

    if (operator === 'inCohort' && cohortId && projectId) {
      where[id] = `notEmpty(${getCohortAlias(cohortId)}.profile_id)`;
      return;
    }

    if (operator === 'notInCohort' && cohortId && projectId) {
      where[id] = `empty(${getCohortAlias(cohortId)}.profile_id)`;
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

    // Handle group. prefixed filters (requires ARRAY JOIN + _g JOIN in query)
    if (name.startsWith('group.') && projectId) {
      const whereFrom = getGroupPropertySql(name);
      switch (operator) {
        case 'is': {
          if (value.length === 1) {
            where[id] =
              `${whereFrom} = ${sqlstring.escape(String(value[0]).trim())}`;
          } else {
            where[id] =
              `${whereFrom} IN (${value.map((val) => sqlstring.escape(String(val).trim())).join(', ')})`;
          }
          break;
        }
        case 'isNot': {
          if (value.length === 1) {
            where[id] =
              `${whereFrom} != ${sqlstring.escape(String(value[0]).trim())}`;
          } else {
            where[id] =
              `${whereFrom} NOT IN (${value.map((val) => sqlstring.escape(String(val).trim())).join(', ')})`;
          }
          break;
        }
        case 'contains': {
          where[id] =
            `(${value.map((val) => `${whereFrom} LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`).join(' OR ')})`;
          break;
        }
        case 'doesNotContain': {
          where[id] =
            `(${value.map((val) => `${whereFrom} NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`).join(' OR ')})`;
          break;
        }
        case 'startsWith': {
          where[id] =
            `(${value.map((val) => `${whereFrom} LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`).join(' OR ')})`;
          break;
        }
        case 'endsWith': {
          where[id] =
            `(${value.map((val) => `${whereFrom} LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`).join(' OR ')})`;
          break;
        }
        case 'isNull': {
          where[id] = `(${whereFrom} = '' OR ${whereFrom} IS NULL)`;
          break;
        }
        case 'isNotNull': {
          where[id] = `(${whereFrom} != '' AND ${whereFrom} IS NOT NULL)`;
          break;
        }
        case 'regex': {
          where[id] =
            `(${value.map((val) => `match(${whereFrom}, ${sqlstring.escape(String(val).trim())})`).join(' OR ')})`;
          break;
        }
      }
      return;
    }

    if (
      name.startsWith('properties.') ||
      name.startsWith('profile.properties.')
    ) {
      const propertyKey = getSelectPropertyKey(name);
      const isWildcard = propertyKey.includes('%');
      const whereFrom = getSelectPropertyKey(name);

      switch (operator) {
        case 'is': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x = ${sqlstring.escape(String(val).trim())}`)
              .join(' OR ')}, ${whereFrom})`;
          } else if (value.length === 1) {
            where[id] =
              `${whereFrom} = ${sqlstring.escape(String(value[0]).trim())}`;
          } else {
            where[id] = `${whereFrom} IN (${value
              .map((val) => sqlstring.escape(String(val).trim()))
              .join(', ')})`;
          }
          break;
        }
        case 'isNot': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x != ${sqlstring.escape(String(val).trim())}`)
              .join(' OR ')}, ${whereFrom})`;
          } else if (value.length === 1) {
            where[id] =
              `${whereFrom} != ${sqlstring.escape(String(value[0]).trim())}`;
          } else {
            where[id] = `${whereFrom} NOT IN (${value
              .map((val) => sqlstring.escape(String(val).trim()))
              .join(', ')})`;
          }
          break;
        }
        case 'contains': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) => `x LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
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
                  `x NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'startsWith': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) => `x LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'endsWith': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) => `x LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`
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
                  `match(${whereFrom}, ${sqlstring.escape(String(val).trim())})`
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
                  `toFloat64OrZero(x) > toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64OrZero(${whereFrom}) > toFloat64(${sqlstring.escape(String(val).trim())})`
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
                  `toFloat64OrZero(x) < toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64OrZero(${whereFrom}) < toFloat64(${sqlstring.escape(String(val).trim())})`
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
                  `toFloat64OrZero(x) >= toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64OrZero(${whereFrom}) >= toFloat64(${sqlstring.escape(String(val).trim())})`
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
                  `toFloat64OrZero(x) <= toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64OrZero(${whereFrom}) <= toFloat64(${sqlstring.escape(String(val).trim())})`
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
                `${name} LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
            )
            .join(' OR ')})`;
          break;
        }
        case 'doesNotContain': {
          where[id] = `(${value
            .map(
              (val) =>
                `${name} NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
            )
            .join(' OR ')})`;
          break;
        }
        case 'startsWith': {
          where[id] = `(${value
            .map(
              (val) =>
                `${name} LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`
            )
            .join(' OR ')})`;
          break;
        }
        case 'endsWith': {
          where[id] = `(${value
            .map(
              (val) =>
                `${name} LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`
            )
            .join(' OR ')})`;
          break;
        }
        case 'regex': {
          where[id] = `(${value
            .map(
              (val) =>
                `match(${name}, ${sqlstring.escape(stripLeadingAndTrailingSlashes(String(val)).trim())})`
            )
            .join(' OR ')})`;
          break;
        }
        case 'gt': {
          if (isNumericColumn(name)) {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64(${name}) > toFloat64(${sqlstring.escape(String(val).trim())})`
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
                  `toFloat64(${name}) < toFloat64(${sqlstring.escape(String(val).trim())})`
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
                  `toFloat64(${name}) >= toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')})`;
          } else {
            where[id] = `(${value
              .map(
                (val) => `${name} >= ${sqlstring.escape(String(val).trim())}`
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
                  `toFloat64(${name}) <= toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')})`;
          } else {
            where[id] = `(${value
              .map(
                (val) => `${name} <= ${sqlstring.escape(String(val).trim())}`
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
