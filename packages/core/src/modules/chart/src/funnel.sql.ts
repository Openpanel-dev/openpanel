// Every ClickHouse statement the funnel service runs, as pure `sql` fragments.
//
// The chart and the profile list are built from ONE base: a breakdown
// expression only works if the join it references was added, and the joins
// depend on the breakdowns, so building the selects in one place and the joins
// in another is exactly the bug that made funnel "View Users" return "No users
// found" for profile-property and cohort breakdowns.
//
// The field resolver and filter compiler render text (see compiled.ts); their
// output — filter clauses, breakdown expressions, the profile CTE columns and
// the cohort joins — is spliced, everything else is bound.
//
// Cluster note: `events`, `profiles`, `groups` and `cohort_members` are
// Distributed on Cloud. Every join runs under the client's
// `distributed_product_mode: 'allow'`; no `IN (subquery)` is involved.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import type {
  IChartBreakdown,
  IChartEvent,
} from '../../report/report.constants';
import { JOINABLE_PROFILE_COLUMNS } from '../chart.constants';
import { compiledText, fragmentWithProfileRefs } from './compiled';
import {
  buildGroupsQuery,
  buildInlineCohortJoin,
  CHART_TABLE,
  type CohortMetadata,
  collectBreakdownCohortIds,
  collectProfilePropertyKeys,
  extractCohortId,
  getSelectPropertyKey,
  isAllCohortsBreakdown,
  isKnownEventField,
  profilePropertiesCteSelect,
} from './field-resolution';
import { getEventFiltersWhereClause } from './filter-where';

/** The two keys windowFunnel may be computed per — a closed set. */
const FUNNEL_GROUPS = ['session_id', 'profile_id'] as const;
export type FunnelGroup = (typeof FUNNEL_GROUPS)[number];

/** Display label for null/empty breakdown values (e.g. property not set). */
export const EMPTY_BREAKDOWN_LABEL = 'Not set';

/** What the profiles join may select: the joinable columns plus the key. */
const FUNNEL_JOIN_COLUMNS = [...JOINABLE_PROFILE_COLUMNS, 'id'];

/** The funnel CTE's events alias — `getSelectPropertyKey` needs the same one. */
const EVENTS_ALIAS = 'events';

// windowFunnel runs in its default (>=) ordering on purpose. 'strict_increase'
// resets step 1 on every matching row and then rejects a later step at the
// same millisecond, so a track() followed by a screen_view in the same ms
// zeroed every step after the first — and server-stamped back-to-back requests
// do collide at ms precision. Same mode as the conversion query.

export interface FunnelBaseInput {
  projectId: string;
  startDate: string;
  endDate: string;
  /** Already merged with the report's global filters and event-only. */
  eventSeries: IChartEvent[];
  /** As requested; unresolvable and all-cohorts breakdowns are dropped here. */
  breakdowns: IChartBreakdown[];
  funnelWindowMilliseconds: number;
  group: FunnelGroup;
  /** The raw `funnelGroup` option — `'group'` forces the groups ARRAY JOIN. */
  funnelGroup?: string;
  cohortMetadata: Map<string, CohortMetadata>;
  /** Travels to `session_timezone`; `toDateTime('…')` parses in it. */
  timezone: string;
}

/** Everything the funnel chart and the funnel profile list share. */
export interface FunnelBase {
  ctes: SqlFragment;
  eventSeries: IChartEvent[];
  breakdowns: IChartBreakdown[];
  group: FunnelGroup;
  timezone: string;
}

/**
 * Drop breakdowns that don't resolve to a known events column, properties
 * path, profile path, group path, or specific cohort — the funnel inlines each
 * breakdown's name via getSelectPropertyKey, so anything that doesn't resolve
 * leaks into the SQL verbatim.
 *
 * `isKnownEventField` accepts the bare `cohort` breakdown because the chart's
 * all-cohorts feature uses it, but the funnel has no equivalent: it renders as
 * `cohort as b_0 FROM events`, which fails with UNKNOWN_IDENTIFIER. Exclude it
 * explicitly rather than relying on the generic check.
 */
export function knownFunnelBreakdowns(
  breakdowns: IChartBreakdown[]
): IChartBreakdown[] {
  return breakdowns.filter(
    (breakdown) =>
      isKnownEventField(breakdown.name) &&
      !isAllCohortsBreakdown(breakdown.name)
  );
}

/**
 * One `<filters> AND events.name = <name>` per step. Exported because each
 * step's complete condition has to appear twice — inside windowFunnel and in
 * the row-level pre-filter — and funnel.sql.test.ts counts exactly that.
 */
export function funnelStepConditions(
  eventSeries: IChartEvent[],
  projectId: string,
  profilePropertyKeys: string[]
): SqlFragment[] {
  return eventSeries.map((event) => {
    // Qualify with 'events' so event-level `properties[...]` becomes
    // `events.properties[...]` — required because the funnel CTE may join the
    // profiles table (which also exposes a `properties` column). Without the
    // qualifier ClickHouse fails with "ambiguous identifier 'properties'"
    // whenever a step filters on properties.X while another step filters on
    // profile.properties.Y.
    const filters = Object.values(
      getEventFiltersWhereClause(event.filters, projectId, 'events')
    ).map((clause) => fragmentWithProfileRefs(clause, profilePropertyKeys));
    return sql.join(
      [...filters, sql`events.name = ${sql.string(event.name)}`],
      ' AND '
    );
  });
}

/**
 * Attribute each breakdown to its value at the user's FIRST funnel step, as a
 * per-group aggregate (argMinIf) — not by adding it to the windowFunnel GROUP
 * BY. Grouping the sequence by a per-row value splits a user's steps across
 * buckets whenever the value isn't identical on every step (e.g. an experiment
 * tag set on the entry event but absent on the conversion event): the later
 * step lands in a separate bucket, the windowFunnel sequence never connects,
 * and downstream steps show 0.
 *
 * `group.*` breakdowns are the exception: their ARRAY JOIN fans each event out
 * per group, and grouping by the group value is intentional — a user in three
 * groups should appear in all three funnels.
 */
function breakdownSelects(
  input: FunnelBaseInput,
  profilePropertyKeys: string[],
  firstStepCondition: SqlFragment
): SqlFragment[] {
  return input.breakdowns.map((breakdown, index) => {
    const cohortId = extractCohortId(breakdown.name);
    const cohortName = cohortId
      ? input.cohortMetadata.get(cohortId)?.name
      : undefined;
    const expression = fragmentWithProfileRefs(
      getSelectPropertyKey(
        breakdown.name,
        input.projectId,
        cohortId ?? undefined,
        cohortName
      ),
      profilePropertyKeys
    );
    const alias = compiledText(`b_${index}`);
    if (breakdown.name.startsWith('group.')) {
      return sql`${expression} as ${alias}`;
    }
    return sql`argMinIf(${expression}, created_at, ${firstStepCondition}) as ${alias}`;
  });
}

/**
 * The profile join has to cover breakdowns as well as filters — a `profile.*`
 * breakdown renders `profile.properties[...]` into the select, so the alias
 * must exist in scope even when no filter touches profiles.
 *
 * Only the referenced profile-property keys are joined, as scalar columns,
 * instead of every profile's whole properties Map: the join hash was carrying
 * ~1KB of Map per profile and OOMing at scale.
 */
/**
 * The profiles columns this join may select, from the filter and breakdown
 * names the caller supplied. Both are user input, so both are matched against
 * the allowlist — unsanitized splicing of a filter name into SQL was a real
 * vulnerability here (GHSA-pc3q-gw7f-p2x2).
 */
export function profileJoinFields(
  profileFilters: string[],
  profileBreakdowns: { name: string }[]
): string[] {
  const fields = new Set<string>(['id']);
  for (const filter of profileFilters) {
    const fieldName = filter.split('.')[0];
    if (fieldName && JOINABLE_PROFILE_COLUMNS.includes(fieldName)) {
      fields.add(fieldName);
    }
  }
  for (const breakdown of profileBreakdowns) {
    const fieldName = breakdown.name.replace('profile.', '').split('.')[0];
    if (fieldName && JOINABLE_PROFILE_COLUMNS.includes(fieldName)) {
      fields.add(fieldName);
    }
  }
  return Array.from(fields);
}

function profileCteColumns(
  input: FunnelBaseInput,
  profileFilters: string[],
  profileKeys: { keys: string[]; needsFullMap: boolean }
): SqlFragment[] {
  const profileBreakdowns = input.breakdowns.filter((breakdown) =>
    breakdown.name.startsWith('profile.')
  );
  if (profileFilters.length === 0 && profileBreakdowns.length === 0) {
    return [];
  }

  const fields = new Set(profileJoinFields(profileFilters, profileBreakdowns));

  // Both the breakdown- and the filter-derived names are vetted above; the
  // allowlist here is the backstop that makes `sql.id` throw rather than
  // inline if either loop ever lets something else through (main #512,
  // GHSA-pc3q-gw7f-p2x2).
  const columns: SqlFragment[] = Array.from(fields).map((field) =>
    sql.id(field, FUNNEL_JOIN_COLUMNS)
  );
  const referencesProperties =
    profileFilters.some((filter) => filter.startsWith('properties')) ||
    profileBreakdowns.some((breakdown) =>
      breakdown.name.startsWith('profile.properties')
    );
  if (referencesProperties) {
    columns.push(
      profilePropertiesCteSelect(profileKeys.keys, profileKeys.needsFullMap)
    );
  }
  return columns;
}

/** The `profile.`-prefixed filter names, unprefixed. */
function profileFilterNames(eventSeries: IChartEvent[]): string[] {
  return eventSeries.flatMap(
    (event) =>
      event.filters
        ?.filter((filter) => filter.name.startsWith('profile.'))
        .map((filter) => filter.name.replace('profile.', '')) ?? []
  );
}

export function funnelBase(input: FunnelBaseInput): FunnelBase {
  const { projectId, eventSeries, breakdowns, group } = input;

  if (eventSeries.length === 0) {
    throw new Error('events are required');
  }

  const profileFilters = profileFilterNames(eventSeries);
  const anyFilterOnGroup = eventSeries.some((event) =>
    event.filters?.some((filter) => filter.name.startsWith('group.'))
  );
  const anyBreakdownOnGroup = breakdowns.some((breakdown) =>
    breakdown.name.startsWith('group.')
  );
  const needsGroupArrayJoin =
    anyFilterOnGroup || anyBreakdownOnGroup || input.funnelGroup === 'group';

  const profileKeys = collectProfilePropertyKeys([
    ...eventSeries.flatMap((event) => event.filters ?? []),
    ...breakdowns,
  ]);

  const conditions = funnelStepConditions(
    eventSeries,
    projectId,
    profileKeys.keys
  );
  const selects = breakdownSelects(
    input,
    profileKeys.keys,
    conditions[0] as SqlFragment
  );

  const primaryKey = sql.id(group, FUNNEL_GROUPS);
  const cteSelects: SqlFragment[] = [
    primaryKey,
    sql`windowFunnel(${sql.uint64(input.funnelWindowMilliseconds)})(toUInt64(toUnixTimestamp64Milli(created_at)), ${sql.join(conditions)}) AS level`,
  ];
  if (group === 'session_id') {
    // Resolves identity changes mid-session.
    cteSelects.push(sql`argMax(profile_id, created_at) AS profile_id`);
  }
  cteSelects.push(...selects);

  const groupByKeys: SqlFragment[] = [primaryKey];
  breakdowns.forEach((breakdown, index) => {
    if (breakdown.name.startsWith('group.')) {
      groupByKeys.push(compiledText(`b_${index}`));
    }
  });

  const columns = profileCteColumns(input, profileFilters, profileKeys);
  const profileJoin =
    columns.length > 0
      ? sql` LEFT JOIN (SELECT ${sql.join(columns, ', ')} FROM ${sql.id(CHART_TABLE.profiles)} FINAL
          WHERE project_id = ${sql.string(projectId)}) as profile ON profile.id = events.profile_id`
      : sql.empty;
  const groupJoin = needsGroupArrayJoin
    ? sql` ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id`
    : sql.empty;
  // A cohort breakdown renders `cohort_<id>.profile_id`, so every cohort
  // referenced by a breakdown needs its join.
  const cohortIds = collectBreakdownCohortIds(breakdowns);
  const cohortJoins =
    cohortIds.length > 0
      ? sql` ${sql.join(
          cohortIds.map((cohortId) =>
            buildInlineCohortJoin(cohortId, projectId, EVENTS_ALIAS)
          ),
          ' '
        )}`
      : sql.empty;

  // Only rows matching at least one step can advance windowFunnel, so rows
  // that share a step's event name but fail its filters are dead weight — with
  // filtered steps (e.g. screen_view + a path filter) they can be the vast
  // majority of what the name IN(...) lets through. Dropping them here shrinks
  // the aggregation input; windowFunnel ignores non-matching rows either way,
  // so levels are unchanged.
  const stepPreFilter = sql`(${sql.join(
    conditions.map((condition) => sql`(${condition})`),
    ' OR '
  )})`;

  const funnelCte = sql`SELECT ${sql.join(cteSelects)} FROM ${sql.id(CHART_TABLE.events)}${profileJoin}${groupJoin}${cohortJoins} WHERE project_id = ${sql.string(projectId)} AND created_at BETWEEN toDateTime(${sql.string(input.startDate)}) AND toDateTime(${sql.string(input.endDate)}) AND events.name IN ${sql.array(
    'String',
    eventSeries.map((event) => event.name)
  )} AND ${stepPreFilter} GROUP BY ${sql.join(groupByKeys)}`;

  const groupsCte = needsGroupArrayJoin
    ? sql`_g AS (${buildGroupsQuery(projectId)}), `
    : sql.empty;

  // windowFunnel is computed per primary key, so the `funnel` CTE only has to
  // drop the level-0 rows — no re-aggregation.
  return {
    ctes: sql`WITH ${groupsCte}session_funnel AS (${funnelCte}), funnel AS (SELECT * FROM session_funnel WHERE level != 0) `,
    eventSeries,
    breakdowns,
    group,
    timezone: input.timezone,
  };
}

/** One row per (level, breakdown combination). */
export function funnelChartQuery(base: FunnelBase): SqlFragment {
  const aliases = base.breakdowns.map((_, index) => compiledText(`b_${index}`));
  const select = sql.join([sql`level`, ...aliases, sql`count() as count`]);
  const groupBy = sql.join([sql`level`, ...aliases]);
  return sql`${base.ctes}SELECT ${select} FROM funnel GROUP BY ${groupBy} ORDER BY level DESC`;
}

export interface FunnelProfilesInput {
  /** 1-based funnel level. */
  targetLevel: number;
  /** Selects only the profiles that stopped exactly at this level. */
  showDropoffs: boolean;
  /**
   * Display labels for the clicked row, per breakdown index. `undefined`
   * leaves that breakdown unconstrained.
   */
  breakdownValues: (string | undefined)[];
  limit: number;
}

/**
 * The clicked row carries DISPLAY labels (trimmed, empty/null shown as
 * EMPTY_BREAKDOWN_LABEL), so the comparison normalises the column the same
 * way. `toString`/`ifNull` keep it valid for numeric and Nullable breakdowns.
 */
function breakdownValueWhere(index: number, value: string): SqlFragment {
  const normalized = compiledText(`trim(ifNull(toString(b_${index}), ''))`);
  if (value === EMPTY_BREAKDOWN_LABEL) {
    return sql`(${normalized} = '' OR ${normalized} = ${sql.string(EMPTY_BREAKDOWN_LABEL)})`;
  }
  return sql`${normalized} = ${sql.string(value)}`;
}

/** The distinct profiles at (or dropping off at) a step. */
export function funnelProfilesQuery(
  base: FunnelBase,
  input: FunnelProfilesInput
): SqlFragment {
  const where: SqlFragment[] = [
    input.showDropoffs
      ? sql`level = ${sql.uint64(input.targetLevel)}`
      : sql`level >= ${sql.uint64(input.targetLevel)}`,
  ];
  base.breakdowns.forEach((_, index) => {
    const value = input.breakdownValues[index];
    if (value !== undefined) {
      where.push(breakdownValueWhere(index, value));
    }
  });
  return sql`${base.ctes}SELECT DISTINCT profile_id FROM funnel WHERE ${sql.join(where, ' AND ')} LIMIT ${sql.uint64(input.limit)}`;
}

/**
 * No in-repo caller. Reachable only through `packages/core/src/index.ts`,
 * which still publishes the wrapper.
 */
export function funnelSessionsQuery(input: {
  projectId: string;
  startDate: string;
  endDate: string;
}): SqlFragment {
  return sql`SELECT profile_id as pid, id as sid FROM ${sql.id(CHART_TABLE.sessions)} WHERE project_id = ${sql.string(input.projectId)} AND created_at BETWEEN toDateTime(${sql.string(input.startDate)}) AND toDateTime(${sql.string(input.endDate)})`;
}
