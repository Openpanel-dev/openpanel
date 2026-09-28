/** biome-ignore-all lint/style/useDefaultSwitchClause: switch cases are exhaustive by design */
// Chart field resolution: how a report's field name (`referrerName`,
// `utm_source`, `properties.x.*`, `profile.email`, `group.name`,
// `cohort:<id>`, `has_profile`) becomes a ClickHouse expression, plus the
// profile-CTE narrowing helpers.
//
// Each resolver returns a `SqlFragment` whose values — cohort ids, cohort
// labels, project ids and the `properties[...]` map keys — bind as
// `{pN:Type}` params, and whose identifiers go through `sql.id`.
//
// The one piece of text this file still builds is the backtick-quoted CTE alias
// `` `profile.properties.<key>` `` (see `profilePropertiesCteSelect`), which is
// an identifier `sql.id` cannot express — three dot-separated parts — and which
// `collectProfilePropertyKeys` already guards. It goes through `compiled.ts`,
// the module's one text seam.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import type { IChartBreakdown } from '../../report/report.constants';
import { PROFILE_SELECT_COLUMNS } from '../chart.constants';
import { compiledText } from './compiled';

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
// @openpanel/db's code-migrations/3-init-ch.ts (+ revenue added in
// 6-add-revenue-column.ts).
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

/** The all-cohorts breakdown's JOIN alias and its fallback label. */
const ALL_COHORTS_DEFAULT_ALIAS = '_all_cohorts';
const ALL_COHORTS_UNKNOWN_LABEL = 'Unknown';

/** Labels a single-cohort breakdown falls back to when the cohort has no name. */
const IN_COHORT_LABEL = 'In Cohort';
const NOT_IN_COHORT_LABEL = 'Not In Cohort';

/**
 * The scalar `profiles` columns the profile CTE may project. Distinct from
 * chart.constants.ts's PROFILE_SELECT_COLUMNS, which is the direct-SELECT
 * allow-list: the CTE never carries `avatar` and does carry `properties`.
 */
const PROFILE_CTE_SCALAR_FIELDS = [
  'email',
  'first_name',
  'last_name',
  'created_at',
  'last_seen_at',
];

/** Everything `collectProfileCteFields` can return — `sql.id`'s closed set. */
export const PROFILE_CTE_FIELDS = [
  'id',
  'properties',
  ...PROFILE_CTE_SCALAR_FIELDS,
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

/**
 * The CTE name a single-cohort breakdown declares. Backtick-quoted because the
 * id contains dashes, which `sql.id` rejects, so it goes through the module's
 * one text seam. Callers must validate the id first — sql.ts builds the
 * same name behind `assertCohortId`.
 */
export function getCohortCteName(cohortId: string): SqlFragment {
  return compiledText(`\`cohort-${cohortId}\``);
}

export function getCohortAlias(cohortId: string): string {
  return `cohort_${cohortId.replace(/-/g, '_')}`;
}

export function buildCohortMembershipQuery(
  cohortId: string,
  projectId: string
): SqlFragment {
  return sql`
    SELECT profile_id
    FROM ${sql.id(CHART_TABLE.cohortMembers)} FINAL
    WHERE cohort_id = ${sql.string(cohortId)}
      AND project_id = ${sql.string(projectId)}
  `;
}

export function buildInlineCohortJoin(
  cohortId: string,
  projectId: string,
  tableAlias: string
): SqlFragment {
  const cohortAlias = getCohortAlias(cohortId);
  const cohortQuery = buildCohortMembershipQuery(cohortId, projectId);
  return sql`LEFT ANY JOIN (${cohortQuery}) AS ${sql.id(cohortAlias)} ON ${sql.id(`${cohortAlias}.profile_id`)} = ${sql.id(`${tableAlias}.profile_id`)}`;
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

export function buildAllCohortsMembershipQuery(projectId: string): SqlFragment {
  return sql`
    SELECT profile_id, cohort_id
    FROM ${sql.id(CHART_TABLE.cohortMembers)} FINAL
    WHERE project_id = ${sql.string(projectId)}
  `;
}

/**
 * The `if(notEmpty(...))` label a single-cohort breakdown selects. Callers
 * must have validated the id — sql.ts guards with `assertCohortId`.
 */
export function cohortBreakdownLabelExpr(
  cohortId: string,
  cohortName?: string
): SqlFragment {
  const cohortAlias = getCohortAlias(cohortId);
  const inLabel = sql.string(cohortName ?? IN_COHORT_LABEL);
  const notInLabel = sql.string(
    cohortName ? `Not ${cohortName}` : NOT_IN_COHORT_LABEL
  );
  return sql`if(notEmpty(${sql.id(`${cohortAlias}.profile_id`)}), ${inLabel}, ${notInLabel})`;
}

/**
 * The membership subselect both filter compilers use for `inCohort` /
 * `notInCohort`. Uses a plain `IN (subquery)`, not `GLOBAL IN` — preserved
 * deliberately as an accepted trade-off, not an oversight.
 */
export function buildCohortMembersSubselect(
  cohortIds: string[],
  projectId: string
): SqlFragment {
  return sql`(SELECT profile_id FROM ${sql.id(CHART_TABLE.cohortMembers)} FINAL WHERE cohort_id IN ${sql.array('String', cohortIds)} AND project_id = ${sql.string(projectId)})`;
}

export function buildAllCohortsLabelExpr(
  cohorts: CohortMetadata[],
  alias = ALL_COHORTS_DEFAULT_ALIAS
): SqlFragment {
  if (cohorts.length === 0) {
    return sql`${sql.string(ALL_COHORTS_UNKNOWN_LABEL)}`;
  }
  const ids = sql.array(
    'String',
    cohorts.map((c) => c.id)
  );
  const names = sql.array(
    'String',
    cohorts.map((c) => c.name)
  );
  return sql`transform(${sql.id(`${alias}.cohort_id`)}, ${ids}, ${names}, ${sql.string(ALL_COHORTS_UNKNOWN_LABEL)})`;
}

/**
 * Cohort IDs that need a `cohort_<id>` JOIN alias to be wired up by the
 * caller. Only cohort *breakdowns* require the JOIN — they reference
 * `cohort_<id>.profile_id` in their SELECT expression via
 * `getSelectPropertyKey`. Filter SQL is self-contained and doesn't need it.
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

/** The `groups` lookup the chart, funnel and conversion statements all join. */
export function buildGroupsQuery(projectId: string): SqlFragment {
  return sql`SELECT id, name, type, properties FROM ${sql.id(CHART_TABLE.groups)} FINAL WHERE project_id = ${sql.string(projectId)}`;
}

// Returns a SQL expression for a group property via the _g JOIN alias
// property format: "group.name", "group.type", "group.properties.plan"
export function getGroupPropertySql(property: string): SqlFragment {
  const withoutPrefix = property.replace(/^group\./, '');
  if (withoutPrefix === 'name') {
    return sql`_g.name`;
  }
  if (withoutPrefix === 'type') {
    return sql`_g.type`;
  }
  if (withoutPrefix.startsWith('properties.')) {
    const propKey = withoutPrefix.replace(/^properties\./, '');
    return sql`_g.properties[${sql.string(propKey)}]`;
  }
  return sql`_group_id`;
}

// Returns the SELECT expression when querying the groups table directly (no join alias).
// Use for fetching distinct values for group.* properties.
export function getGroupPropertySelect(property: string): SqlFragment {
  const withoutPrefix = property.replace(/^group\./, '');
  if (withoutPrefix === 'name') {
    return sql`name`;
  }
  if (withoutPrefix === 'type') {
    return sql`type`;
  }
  if (withoutPrefix === 'id') {
    return sql`id`;
  }
  if (withoutPrefix.startsWith('properties.')) {
    const propKey = withoutPrefix.replace(/^properties\./, '');
    return sql`properties[${sql.string(propKey)}]`;
  }
  return sql`id`;
}

// Returns the SELECT expression when querying the profiles table directly (no join alias).
// Use for fetching distinct values for profile.* properties.
export function getProfilePropertySelect(property: string): SqlFragment {
  const withoutPrefix = property.replace(/^profile\./, '');
  if (PROFILE_SELECT_COLUMNS.includes(withoutPrefix)) {
    return sql.id(withoutPrefix, PROFILE_SELECT_COLUMNS);
  }
  if (withoutPrefix.startsWith('properties.')) {
    const propKey = withoutPrefix.replace(/^properties\./, '');
    return sql`properties[${sql.string(propKey)}]`;
  }
  return sql`id`;
}

/** The `properties` / `profile.properties` map prefixes, longest match wins. */
const PROPERTY_MAP_PREFIXES = ['properties', 'profile.properties'];

function matchPropertyMapPrefix(property: string): string | undefined {
  return PROPERTY_MAP_PREFIXES.find((pattern) =>
    property.startsWith(`${pattern}.`)
  );
}

/**
 * True when `getSelectPropertyKey` renders an ARRAY expression rather than a
 * scalar, decided by testing the rendered TEXT for a `%`. That's reachable
 * two ways: the wildcard branch emits `transformPropertyKey`'s pattern, and a
 * NON-wildcard key containing a literal `%` also matches — a known defect
 * (`properties.a%b` is treated as an array and fails at ClickHouse), kept for
 * behavioral parity.
 */
export function isWildcardPropertyKey(rawProperty: string): boolean {
  const property = normalizeEventField(rawProperty);
  const match = matchPropertyMapPrefix(property);
  if (!match) {
    return false;
  }
  if (property.includes('*')) {
    return transformPropertyKey(property).includes('%');
  }
  return property.replace(new RegExp(`^${match}.`), '').includes('%');
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
): SqlFragment {
  // Map camelCase aliases (`referrerName` → `referrer_name`) and bare UTM
  // names (`utm_source` → `properties.__query.utm_source`) into their
  // canonical form before doing any pattern matching. The fallback at the
  // bottom of this function returns `property` verbatim, so without this
  // normalization an alias would leak into the generated SQL and fail with
  // UNKNOWN_IDENTIFIER.
  const property = normalizeEventField(rawProperty);
  const extractedCohortId = cohortId || extractCohortId(property);

  if (extractedCohortId && projectId) {
    return cohortBreakdownLabelExpr(extractedCohortId, cohortName);
  }

  if (property === 'has_profile') {
    return sql`if(profile_id != device_id, 'true', 'false')`;
  }

  // Handle group properties — requires ARRAY JOIN + _g JOIN to be present in query
  if (property.startsWith('group.') && projectId) {
    return getGroupPropertySql(property);
  }

  const match = matchPropertyMapPrefix(property);
  if (!match) {
    // Not a map access: a top-level column, or a name the caller has already
    // vetted with `isKnownEventField`. `sql.id` throws on anything else rather
    // than inlining it.
    return sql.id(property);
  }

  // Only the events table's bare `properties` map needs aliasing —
  // `profile.properties` already routes through the profile join alias.
  const map = sql.id(
    match === 'properties' && eventsAlias ? `${eventsAlias}.${match}` : match
  );

  if (property.includes('*')) {
    return sql`arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(${map}, ${sql.string(
      transformPropertyKey(property)
    )})))`;
  }

  return sql`${map}[${sql.string(property.replace(new RegExp(`^${match}.`), ''))}]`;
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
): SqlFragment {
  // The alias has three dot-separated parts, so it is text, not `sql.id`.
  // `collectProfilePropertyKeys` already rejects the two characters that
  // could break out of the backticks.
  const cols = keys.map(
    (k) =>
      sql`properties[${sql.string(k)}] as ${compiledText(`\`profile.properties.${k}\``)}`
  );
  if (needsFullMap || cols.length === 0) {
    cols.push(sql`properties as "profile.properties"`);
  }
  return sql.join(cols, ', ');
}

/**
 * The top-level profiles columns a chart's `profile.*` references read —
 * `id` always (the join key), then `properties` / the recognized scalar
 * columns, in first-seen order.
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
