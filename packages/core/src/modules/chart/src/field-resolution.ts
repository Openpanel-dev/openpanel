/** biome-ignore-all lint/style/useDefaultSwitchClause: switch cases are exhaustive by design */
// V1's chart field resolution, moved verbatim from
// packages/db/src/services/chart.service.ts (M7-003): how a report's field
// name (`referrerName`, `utm_source`, `properties.x.*`, `profile.email`,
// `group.name`, `cohort:<id>`, `has_profile`) becomes a ClickHouse
// expression, plus the profile-CTE narrowing helpers.
//
// These render TEXT with sqlstring on purpose. They are the SELECT/JOIN half
// of the filter compiler that funnel, conversion, sankey, retention and
// overview (M7-004/M7-005) still splice into their own builders, and ADR-013
// leaves the shared compilers as they are until their last consumer converts
// ("two behaviours, not two builders"). chart.sql.ts splices their output
// through compiled.ts — the one bridge — and binds every chart-level value
// (project id, event name, dates, timezone, cohort ids/names, limits) itself.

import sqlstring from 'sqlstring';
import type { IChartBreakdown } from '../../report/report.constants';

export const CHART_TABLE = {
  events: 'events',
  profiles: 'profiles',
  groups: 'groups',
  sessions: 'sessions',
  cohortMembers: 'cohort_members',
  eventNamesMv: 'distinct_event_names_mv',
  eventPropertyValuesMv: 'event_property_values_mv',
  dauMv: 'dau_mv',
  cohortEventsMv: 'cohort_events_mv',
} as const;

// Top-level columns on the events table. Derived from the migration in
// code-migrations/3-init-ch.ts (+ revenue added in 6-add-revenue-column.ts).
// Used to distinguish real columns from property keys and reject unknown
// identifiers before they reach ClickHouse.
export const EVENT_TOP_LEVEL_COLUMNS = new Set<string>([
  'id',
  'name',
  'sdk_name',
  'sdk_version',
  'device_id',
  'profile_id',
  'project_id',
  'session_id',
  'path',
  'origin',
  'referrer',
  'referrer_name',
  'referrer_type',
  'duration',
  'revenue',
  'created_at',
  'country',
  'city',
  'region',
  'longitude',
  'latitude',
  'os',
  'os_version',
  'browser',
  'browser_version',
  'device',
  'brand',
  'model',
  'imported_at',
]);

// Older clients / saved reports send some field names in camelCase. Map them
// to the canonical snake_case ClickHouse column so they don't fall through as
// unknown identifiers. The bare values (`utm_source` etc.) actually live in
// the `properties` map — `normalizeEventField` rewrites those into the
// `properties.__query.utm_*` form.
export const EVENT_FIELD_ALIASES: Record<string, string> = {
  referrerName: 'referrer_name',
  referrerType: 'referrer_type',
  sessionId: 'session_id',
  deviceId: 'device_id',
  profileId: 'profile_id',
  projectId: 'project_id',
  osVersion: 'os_version',
  browserVersion: 'browser_version',
  sdkName: 'sdk_name',
  sdkVersion: 'sdk_version',
  createdAt: 'created_at',
  importedAt: 'imported_at',
};

const EVENT_UTM_BARE_COLUMNS = new Set<string>([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
]);

const NUMERIC_EVENT_COLUMNS = ['duration', 'revenue', 'longitude', 'latitude'];

const PROFILE_CTE_SCALAR_FIELDS = [
  'email',
  'first_name',
  'last_name',
  'created_at',
  'last_seen_at',
];

// Normalize an incoming field name into its canonical form. Returns a string
// suitable for `getSelectPropertyKey` / `getEventFiltersWhereClause` — i.e.
// either a top-level column name (`referrer_name`), a `properties.foo` /
// `profile.foo` / `group.foo` path, or `has_profile`. Unknown names are
// returned unchanged; callers must guard with `isKnownEventField` before
// inlining into SQL.
export function normalizeEventField(name: string): string {
  if (EVENT_FIELD_ALIASES[name]) {
    return EVENT_FIELD_ALIASES[name]!;
  }
  if (EVENT_UTM_BARE_COLUMNS.has(name)) {
    return `properties.__query.${name}`;
  }
  return name;
}

// Returns true if `name` resolves to something we can inline into SQL safely:
// a known top-level events column, a properties / profile / group path, a
// cohort breakdown, or `has_profile`. Used to drop unknown filters/breakdowns
// instead of emitting invalid `SELECT cohort` / `SELECT temple_name` queries.
export function isKnownEventField(name: string): boolean {
  if (name === 'has_profile') {
    return true;
  }
  if (isAllCohortsBreakdown(name)) {
    return true;
  }
  if (extractCohortId(name)) {
    return true;
  }
  if (name.startsWith('properties.')) {
    return true;
  }
  if (name.startsWith('profile.')) {
    return true;
  }
  if (name.startsWith('group.')) {
    return true;
  }
  const normalized = normalizeEventField(name);
  if (normalized.startsWith('properties.')) {
    return true;
  }
  if (EVENT_TOP_LEVEL_COLUMNS.has(normalized)) {
    return true;
  }
  return false;
}

export function isNumericColumn(columnName: string): boolean {
  return NUMERIC_EVENT_COLUMNS.includes(columnName);
}

export interface CohortMetadata {
  id: string;
  name: string;
}

export function getCohortCteName(cohortId: string): string {
  return `\`cohort-${cohortId}\``;
}

export function getCohortAlias(cohortId: string): string {
  return `cohort_${cohortId.replace(/-/g, '_')}`;
}

export function buildCohortMembershipQuery(
  cohortId: string,
  projectId: string
): string {
  return `
    SELECT profile_id
    FROM ${CHART_TABLE.cohortMembers} FINAL
    WHERE cohort_id = ${sqlstring.escape(cohortId)}
      AND project_id = ${sqlstring.escape(projectId)}
  `;
}

export function buildInlineCohortJoin(
  cohortId: string,
  projectId: string,
  tableAlias: string
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

export function isAllCohortsBreakdown(breakdownName: string): boolean {
  return breakdownName === 'cohort';
}

export function buildAllCohortsMembershipQuery(projectId: string): string {
  return `
    SELECT profile_id, cohort_id
    FROM ${CHART_TABLE.cohortMembers} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
  `;
}

export function buildAllCohortsLabelExpr(
  cohorts: CohortMetadata[],
  alias = '_all_cohorts'
): string {
  if (cohorts.length === 0) {
    return "'Unknown'";
  }
  const ids = cohorts.map((c) => sqlstring.escape(c.id)).join(', ');
  const names = cohorts.map((c) => sqlstring.escape(c.name)).join(', ');
  return `transform(${alias}.cohort_id, [${ids}], [${names}], 'Unknown')`;
}

/**
 * Cohort IDs that need a `cohort_<id>` JOIN alias to be wired up by the
 * caller. After filter SQL became self-contained, only cohort *breakdowns*
 * require the JOIN — they reference `cohort_<id>.profile_id` in their
 * SELECT expression via `getSelectPropertyKey`.
 */
export function collectBreakdownCohortIds(
  breakdowns: IChartBreakdown[]
): string[] {
  const ids = new Set<string>();
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
// Lists the same profiles columns as PROFILE_COLUMNS in filter-where.service.ts,
// which resolves profile.* on the filter side; keep the two in sync.
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
  if (withoutPrefix === 'created_at') {
    return 'created_at';
  }
  if (withoutPrefix === 'last_seen_at') {
    return 'last_seen_at';
  }
  if (withoutPrefix.startsWith('properties.')) {
    const propKey = withoutPrefix.replace(/^properties\./, '');
    return `properties[${sqlstring.escape(propKey)}]`;
  }
  return 'id';
}

export function getSelectPropertyKey(
  rawProperty: string,
  projectId?: string,
  cohortId?: string,
  cohortName?: string,
  /**
   * When set, the events table's `properties` map is qualified with this
   * alias (e.g. `e.properties[...]`). Required in any query where another
   * joined table also exposes a `properties` column (such as the groups
   * `_g` join), otherwise ClickHouse rejects with "ambiguous identifier".
   */
  eventsAlias?: string
) {
  // Map camelCase aliases (`referrerName` → `referrer_name`) and bare UTM
  // names (`utm_source` → `properties.__query.utm_source`) into their
  // canonical form before doing any pattern matching. The fallback at the
  // bottom of this function returns `property` verbatim, so without this
  // normalization an alias would leak into the generated SQL and fail with
  // UNKNOWN_IDENTIFIER.
  const property = normalizeEventField(rawProperty);
  const extractedCohortId = cohortId || extractCohortId(property);

  if (extractedCohortId && projectId) {
    const cohortAlias = getCohortAlias(extractedCohortId);
    const inLabel = cohortName ? sqlstring.escape(cohortName) : "'In Cohort'";
    const notInLabel = cohortName
      ? sqlstring.escape(`Not ${cohortName}`)
      : "'Not In Cohort'";
    return `if(notEmpty(${cohortAlias}.profile_id), ${inLabel}, ${notInLabel})`;
  }

  if (property === 'has_profile') {
    return "if(profile_id != device_id, 'true', 'false')";
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

  // Only the events table's bare `properties` map needs aliasing —
  // `profile.properties` already routes through the profile join alias.
  const aliasPrefix =
    match === 'properties' && eventsAlias ? `${eventsAlias}.` : '';

  if (property.includes('*')) {
    return `arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(${aliasPrefix}${match}, ${sqlstring.escape(
      transformPropertyKey(property)
    )})))`;
  }

  return `${aliasPrefix}${match}['${property.replace(new RegExp(`^${match}.`), '')}']`;
}

// --- profile-property CTE narrowing (perf) ---------------------------------
// profile.properties.<key> refs render as Map lookups `profile.properties['<key>']`.
// Pulling the whole `properties` Map into the profile CTE makes the LEFT ANY
// JOIN hash carry the full Map per profile — roughly a kilobyte each on real
// data — and OOMs at scale. Instead we project ONLY the referenced keys as
// scalar columns in the CTE and rewrite the refs to those columns — identical
// results at a fraction of the memory. Wildcard refs (mapExtractKeyLike) still
// need the full Map, so those fall back to selecting it.

const PROFILE_PROP_PREFIX = 'profile.properties.';

export function collectProfilePropertyKeys(refs: { name: string }[]): {
  keys: string[];
  needsFullMap: boolean;
} {
  const keys = new Set<string>();
  let needsFullMap = false;
  for (const { name } of refs) {
    if (!name.startsWith(PROFILE_PROP_PREFIX)) {
      continue;
    }
    // Wildcard refs render as mapExtractKeyLike over the whole Map.
    if (name.includes('*')) {
      needsFullMap = true;
      continue;
    }
    const key = name.slice(PROFILE_PROP_PREFIX.length);
    // A backtick or backslash in the key can't be embedded in the
    // backtick-quoted scalar alias. Such keys are never narrowed: the full
    // Map stays selected and their refs keep the original Map access.
    if (/[`\\]/.test(key)) {
      needsFullMap = true;
      continue;
    }
    keys.add(key);
  }
  return { keys: Array.from(keys), needsFullMap };
}

// The profile-CTE SELECT expression for the `properties` field: one scalar
// column per referenced key, plus the full Map only when a wildcard ref needs
// it (or when nothing specific was referenced).
export function profilePropertiesCteSelect(
  keys: string[],
  needsFullMap: boolean
): string {
  const cols = keys.map(
    (k) => `properties[${sqlstring.escape(k)}] as \`profile.properties.${k}\``
  );
  if (needsFullMap || cols.length === 0) {
    cols.push('properties as "profile.properties"');
  }
  return cols.join(', ');
}

// Rewrite `profile.properties['<key>']` -> `` `profile.properties.<key>` ``
// for the narrowed keys. Matches the raw render from getSelectPropertyKey /
// the filter builders; never matches the CTE's own `properties['<key>']`,
// which has no `profile.` prefix. No-op when keys is empty.
export function rewriteProfilePropertyRefs(
  sql: string,
  keys: string[]
): string {
  let out = sql;
  for (const k of keys) {
    out = out
      .split(`profile.properties['${k}']`)
      .join(`\`profile.properties.${k}\``);
  }
  return out;
}

/**
 * The top-level profiles columns a chart's `profile.*` references read —
 * `id` always (the join key), then `properties` / the scalar columns V1's
 * `getProfileFields` recognised, in first-seen order.
 */
export function collectProfileCteFields(refs: { name: string }[]): string[] {
  const fields = new Set<string>(['id']);
  for (const { name } of refs) {
    if (!name.startsWith('profile.')) {
      continue;
    }
    const fieldName = name.replace('profile.', '').split('.')[0];
    if (fieldName === 'properties') {
      fields.add('properties');
    } else if (fieldName && PROFILE_CTE_SCALAR_FIELDS.includes(fieldName)) {
      fields.add(fieldName);
    }
  }
  return Array.from(fields);
}
