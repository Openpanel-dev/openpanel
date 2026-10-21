// Every ClickHouse statement the funnel service runs, as pure `sql` fragments.
//
// The chart and the profile list are built from ONE base: a breakdown
// expression only works if the join it references was added, and the joins
// depend on the breakdowns, so building them apart made funnel "View Users"
// return no users for profile-property and cohort breakdowns.
//
// Cluster note: `events`, `profiles`, `groups` and `cohort_members` are
// Distributed on Cloud. Every join runs under the client's
// `distributed_product_mode: 'allow'`; the profile join's id set is `GLOBAL IN`.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import type {
  IChartBreakdown,
  IChartEvent,
  IChartEventFilter,
} from '../../report/report.constants';
import { JOINABLE_PROFILE_COLUMNS } from '../chart.constants';
import { compiledText, fragmentWithProfileRefs } from './compiled';
import { eventMatchCondition, eventNamesOf } from './event-match';
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
  latestProfileValue,
  profileIdsInWindow,
  profilePropertiesCteSelect,
} from './field-resolution';
import {
  filterReadsProfileJoin,
  getEventFiltersWhereClause,
} from './filter-where';
import {
  type FirstOccurrencePeriod,
  firstTimeCondition,
  rangePeriod,
} from './first-time';

/** The two keys windowFunnel may be computed per — a closed set. */
const FUNNEL_GROUPS = ['session_id', 'profile_id'] as const;
export type FunnelGroup = (typeof FUNNEL_GROUPS)[number];

/** Display label for null/empty breakdown values (e.g. property not set). */
export const EMPTY_BREAKDOWN_LABEL = 'Not set';

export function didNotReachStepLabel(step: number): string {
  return `Did not reach step ${step}`;
}

/** The 1-based step a breakdown reads its value from; out-of-range falls back to the first. */
function breakdownStep(breakdown: IChartBreakdown, stepCount: number): number {
  const step = breakdown.step ?? 1;
  return step <= stepCount ? step : 1;
}

/** What the profiles join may select: the joinable columns plus the key. */
const FUNNEL_JOIN_COLUMNS = [...JOINABLE_PROFILE_COLUMNS, 'id'];

/** The funnel CTE's events alias — `getSelectPropertyKey` needs the same one. */
const EVENTS_ALIAS = 'events';

/** The per-group array of step matches the breakdown replays read. */
const STEP_EVENTS_ALIAS = 'step_events';

/** The step bitmask in `step_events` is a UInt64. */
const MAX_SEQUENCED_STEPS = 64;

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
 * One `<filters> AND <event match>` per step, plus the first-occurrence
 * condition for a "first time" step. Exported because each step's complete
 * condition has to appear twice, inside windowFunnel and in the row-level
 * pre-filter, and funnel.sql.test.ts counts exactly that.
 */
export function funnelStepConditions(
  eventSeries: IChartEvent[],
  projectId: string,
  profilePropertyKeys: string[],
  period?: FirstOccurrencePeriod
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
    const eventMatch = eventMatchCondition(event, projectId, 'events');
    const firstTime = period
      ? firstTimeCondition({
          event,
          projectId,
          eventsAlias: EVENTS_ALIAS,
          period,
        })
      : null;
    const parts = [...filters, eventMatch, firstTime].filter(
      (part): part is SqlFragment => part !== null
    );
    return parts.length > 0 ? sql.join(parts, ' AND ') : sql`1`;
  });
}

/**
 * Each user's step matches as `(timestamp, step, breakdown values)`, in the
 * order windowFunnel processes them: by time, then by step. A row matching
 * several steps appears once per step. Rows are aggregated as a step bitmask
 * and expanded afterwards, because building a small array per row was most of
 * the query's cost.
 */
function matchedStepEvents(
  stepConditions: SqlFragment[],
  values: SqlFragment[]
): SqlFragment {
  if (stepConditions.length > MAX_SEQUENCED_STEPS) {
    throw new Error(
      `Funnel breakdowns support at most ${MAX_SEQUENCED_STEPS} steps`
    );
  }
  const stepMask = stepConditions
    .map(
      (condition, index) =>
        sql`toUInt64(${condition}) * ${sql.uint64(2n ** BigInt(index))}`
    )
    .reduce((sum, term) => sql`${sum} + ${term}`);
  const valueTuple = sql`tuple(${sql.join(
    values.map((value) => sql`ifNull(toString(${value}), '')`)
  )})`;
  const rows = sql`groupArray((toInt64(toUnixTimestamp64Milli(created_at)), ${stepMask}, ${valueTuple}))`;
  return sql`arraySort(e -> (e.1, e.2), arrayFlatten(arrayMap(matched_row -> arrayMap(step_index -> (matched_row.1, step_index, matched_row.3), arrayFilter(step_index -> bitTest(matched_row.2, step_index - 1), range(1, ${sql.uint64(stepConditions.length)} + 1))), ${rows}))) AS ${compiledText(STEP_EVENTS_ALIAS)}`;
}

/**
 * Replays windowFunnel over `step_events` so a breakdown reads its value from
 * the event in the chain that reached the user's deepest level, not just any
 * event matching the step. Each level keeps its chain's start time and the
 * value picked up at `step`; a step extends the previous level's chain when it
 * lands inside the window, exactly as windowFunnel does, and the first chain
 * to reach a new deepest level wins.
 */
function valueAtStepInSequence(input: {
  valueIndex: number;
  step: number;
  stepCount: number;
  windowMilliseconds: number;
}): SqlFragment {
  const stepCount = sql.uint64(input.stepCount);
  const step = sql.uint64(input.step);
  const valueIndex = sql.uint64(input.valueIndex);
  const window = sql.uint64(input.windowMilliseconds);
  const carried = sql`if(e.2 = ${step}, tupleElement(e.3, ${valueIndex}), if(e.2 = 1, '', acc.2[e.2 - 1]))`;
  return sql`arrayFold((acc, e) -> if(e.2 = 1 OR (acc.1[e.2 - 1] >= 0 AND e.1 <= acc.1[e.2 - 1] + ${window}), (arrayMap((chain_start, level_index) -> if(level_index = e.2, if(e.2 = 1, e.1, acc.1[e.2 - 1]), chain_start), acc.1, range(1, ${stepCount} + 1)), arrayMap((chain_value, level_index) -> if(level_index = e.2, ${carried}, chain_value), acc.2, range(1, ${stepCount} + 1)), if(e.2 > acc.3, e.2, acc.3), if(e.2 > acc.3, ${carried}, acc.4)), acc), ${compiledText(STEP_EVENTS_ALIAS)}, (arrayWithConstant(${stepCount}, toInt64(-1)), arrayWithConstant(${stepCount}, ''), toUInt64(0), '')).4`;
}

function breakdownExpression(
  input: FunnelBaseInput,
  breakdown: IChartBreakdown,
  profilePropertyKeys: string[]
): SqlFragment {
  const cohortId = extractCohortId(breakdown.name);
  const cohortName = cohortId
    ? input.cohortMetadata.get(cohortId)?.name
    : undefined;
  return fragmentWithProfileRefs(
    getSelectPropertyKey(
      breakdown.name,
      input.projectId,
      cohortId ?? undefined,
      cohortName
    ),
    profilePropertyKeys
  );
}

/**
 * Breakdowns are per-group aggregates read from the user's funnel sequence,
 * not windowFunnel GROUP BY keys. Grouping the sequence by a per-row value
 * splits a user's steps across buckets whenever the value isn't identical on
 * every step (e.g. an experiment tag set on the entry event but absent on the
 * conversion event), so downstream steps show 0.
 *
 * With a later step, users who never reached it get their own bucket, since a
 * property that only exists on that step would otherwise lump them into
 * "Not set" with users whose value really is empty.
 *
 * `group.*` breakdowns are the exception: their ARRAY JOIN fans each event out
 * per group, and grouping by the group value is intentional — a user in three
 * groups should appear in all three funnels.
 */
function breakdownSelects(
  input: FunnelBaseInput,
  profilePropertyKeys: string[],
  stepConditions: SqlFragment[]
): SqlFragment[] {
  const sequenced = input.breakdowns.filter(
    (breakdown) => !breakdown.name.startsWith('group.')
  );
  const selects = input.breakdowns.map((breakdown, index) => {
    const alias = compiledText(`b_${index}`);
    if (breakdown.name.startsWith('group.')) {
      return sql`${breakdownExpression(input, breakdown, profilePropertyKeys)} as ${alias}`;
    }
    const step = breakdownStep(breakdown, stepConditions.length);
    const value = valueAtStepInSequence({
      valueIndex: sequenced.indexOf(breakdown) + 1,
      step,
      stepCount: stepConditions.length,
      windowMilliseconds: input.funnelWindowMilliseconds,
    });
    if (step === 1) {
      return sql`${value} as ${alias}`;
    }
    return sql`if(level >= ${sql.uint64(step)}, ${value}, ${sql.string(didNotReachStepLabel(step))}) as ${alias}`;
  });
  if (sequenced.length === 0) {
    return selects;
  }
  const values = sequenced.map((breakdown) =>
    breakdownExpression(input, breakdown, profilePropertyKeys)
  );
  return [matchedStepEvents(stepConditions, values), ...selects];
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

  // The allowlist is the backstop that makes `sql.id` throw rather than inline
  // if either loop above lets something else through (GHSA-pc3q-gw7f-p2x2).
  const columns: SqlFragment[] = Array.from(fields).map((field) =>
    field === 'id'
      ? sql.id(field, FUNNEL_JOIN_COLUMNS)
      : sql`${latestProfileValue(field, sql.id(field, FUNNEL_JOIN_COLUMNS))} AS ${sql.id(field, FUNNEL_JOIN_COLUMNS)}`
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

/** Filters whose compiled clause reads the profile join. */
function profileJoinFilters(eventSeries: IChartEvent[]): IChartEventFilter[] {
  return eventSeries.flatMap(
    (event) => event.filters?.filter(filterReadsProfileJoin) ?? []
  );
}

export function funnelBase(input: FunnelBaseInput): FunnelBase {
  const { projectId, eventSeries, breakdowns, group } = input;

  if (eventSeries.length === 0) {
    throw new Error('events are required');
  }

  const joinFilters = profileJoinFilters(eventSeries);
  const profileFilters = joinFilters.map((filter) =>
    filter.name.replace('profile.', '')
  );
  const anyFilterOnGroup = eventSeries.some((event) =>
    event.filters?.some((filter) => filter.name.startsWith('group.'))
  );
  const anyBreakdownOnGroup = breakdowns.some((breakdown) =>
    breakdown.name.startsWith('group.')
  );
  const needsGroupArrayJoin =
    anyFilterOnGroup || anyBreakdownOnGroup || input.funnelGroup === 'group';

  const profileKeys = collectProfilePropertyKeys([
    ...joinFilters,
    ...breakdowns,
  ]);

  const conditions = funnelStepConditions(
    eventSeries,
    projectId,
    profileKeys.keys,
    rangePeriod(input.startDate, input.endDate)
  );
  const selects = breakdownSelects(input, profileKeys.keys, conditions);

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

  const dateRange = sql`created_at BETWEEN toDateTime(${sql.string(input.startDate)}) AND toDateTime(${sql.string(input.endDate)})`;
  const eventNames = eventSeries.flatMap(eventNamesOf);
  const columns = profileCteColumns(input, profileFilters, profileKeys);
  const activeProfiles = profileIdsInWindow({
    projectId,
    eventNames,
    window: [dateRange],
  });
  const profileJoin =
    columns.length > 0
      ? sql` LEFT JOIN (SELECT ${sql.join(columns, ', ')} FROM ${sql.id(CHART_TABLE.profiles)}
          WHERE project_id = ${sql.string(projectId)} AND ${activeProfiles} GROUP BY id) as profile ON profile.id = events.profile_id`
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

  const funnelCte = sql`SELECT ${sql.join(cteSelects)} FROM ${sql.id(CHART_TABLE.events)}${profileJoin}${groupJoin}${cohortJoins} WHERE project_id = ${sql.string(projectId)} AND ${dateRange}${eventNames.includes('*') ? sql.empty : sql` AND events.name IN ${sql.array('String', eventNames)}`} AND ${stepPreFilter} GROUP BY ${sql.join(groupByKeys)}`;

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

export function funnelSessionsQuery(input: {
  projectId: string;
  startDate: string;
  endDate: string;
}): SqlFragment {
  return sql`SELECT profile_id as pid, id as sid FROM ${sql.id(CHART_TABLE.sessions)} WHERE project_id = ${sql.string(input.projectId)} AND created_at BETWEEN toDateTime(${sql.string(input.startDate)}) AND toDateTime(${sql.string(input.endDate)})`;
}
