// Every ClickHouse statement the sankey (user-flow) service runs, as pure
// `sql` fragments (ADR-013). Converted 1:1 from
// packages/db/src/services/sankey.service.ts (M7-004): the SQL text is V1's
// clix output, with the project id, event names, dates, the step count and the
// top-entry event list bound as `{pN:Type}` parameters instead of hand-escaped
// literals. Result-set proof: sankey.sql.proof.md.
//
// The filter compiler still renders text (see compiled.ts); only its output is
// spliced.
//
// Cluster note (docs/ENVIRONMENT.md): `events` is Distributed on Cloud, and the
// `session_id IN (SELECT session_id FROM start_event_sessions)` HAVING clauses
// are plain `IN (subquery)` over a CTE — V1's exact shape, ported verbatim. No
// `IN` is converted to or from `GLOBAL IN` here; whether these should be
// `GLOBAL IN` on a cluster is a pre-existing question this conversion neither
// answers nor changes.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import { compiledText } from './compiled';
import { CHART_TABLE } from './field-resolution';

export type SankeyMode = 'after' | 'before' | 'between';

/** How many entry events the flow starts from. */
export const TOP_ENTRY_EVENTS = 3;

/** The dedup + transition pieces every mode shares, verbatim from V1. */
const DEDUPE_CONSECUTIVE = compiledText(`arrayFilter(
          (x, i) -> i = 1 OR x != events_raw[i - 1],
          groupArray(event_name) as events_raw,
          arrayEnumerate(events_raw)
        ) as events_deduped`);

/**
 * 'after' mode stops the path at the first repeated event, so a loop back to
 * the entry event ends the flow instead of folding onto itself.
 */
const TRUNCATE_AT_REPEAT = compiledText(`if(
      arrayFirstIndex(x -> x > 1, arrayEnumerateUniq(events_sliced)) = 0,
      events_sliced,
      arraySlice(
        events_sliced,
        1,
        arrayFirstIndex(x -> x > 1, arrayEnumerateUniq(events_sliced)) - 1
      )
    )`);

const TRANSITION_PAIRS = compiledText(
  '(SELECT arrayJoin(arrayMap(i -> (events[i], events[i + 1], i), range(1, length(events)))) as pair FROM session_paths WHERE length(events) >= 2)'
);

const MIN_PATH_LENGTH = 2;

export interface SankeyEvent {
  name: string;
  /** Compiled filter clauses for this event's session CTE. */
  whereClause: string;
}

export interface SankeyPathsInput {
  projectId: string;
  startDate: string;
  endDate: string;
  steps: number;
  mode: SankeyMode;
  startEvent?: SankeyEvent;
  endEvent?: SankeyEvent;
  /** Compiled `name IN (...)` / `name NOT IN (...)` clause, if any. */
  include?: string[];
  exclude: string[];
}

function dateRange(input: SankeyPathsInput): SqlFragment {
  return sql`project_id = ${sql.string(input.projectId)} AND created_at BETWEEN toDateTime(${sql.string(input.startDate)}) AND toDateTime(${sql.string(input.endDate)})`;
}

/**
 * V1 `buildEventNameFilter`: an include list wins over an exclude list, and it
 * always carries the start/end events so the flow's anchors survive it.
 */
function eventNameFilter(input: SankeyPathsInput): SqlFragment {
  if (input.include && input.include.length > 0) {
    const names = [
      ...input.include,
      input.startEvent?.name,
      input.endEvent?.name,
    ].filter((name): name is string => name !== undefined);
    return sql` AND name IN ${sql.array('String', names)}`;
  }
  if (input.exclude.length > 0) {
    return sql` AND name NOT IN ${sql.array('String', input.exclude)}`;
  }
  return sql.empty;
}

/** Sessions in which one anchor event (with its own filters) occurred. */
function sessionEventCte(
  event: SankeyEvent,
  input: SankeyPathsInput
): SqlFragment {
  const filters = event.whereClause
    ? sql` AND ${compiledText(event.whereClause)}`
    : sql.empty;
  return sql`SELECT session_id FROM ${sql.id(CHART_TABLE.events)} WHERE project_id = ${sql.string(input.projectId)} AND name = ${sql.string(event.name)} AND created_at BETWEEN toDateTime(${sql.string(input.startDate)}) AND toDateTime(${sql.string(input.endDate)})${filters} GROUP BY session_id`;
}

interface ModeConfig {
  /** `null` when the mode has no session restriction (V1's `1 = 1`). */
  sessionFilter: SqlFragment | null;
  eventsSlice: SqlFragment;
}

function modeConfig(input: SankeyPathsInput): ModeConfig {
  const { mode, startEvent, endEvent, steps } = input;
  const stepCount = sql.uint64(steps);
  const defaultSlice = sql`arraySlice(events_deduped, 1, ${stepCount})`;
  const inStartSessions = sql`session_id IN (SELECT session_id FROM start_event_sessions)`;

  if (mode === 'after' && startEvent) {
    const name = sql.string(startEvent.name);
    return {
      sessionFilter: inStartSessions,
      eventsSlice: sql`arraySlice(events_deduped, arrayFirstIndex(x -> x = ${name}, events_deduped), ${stepCount})`,
    };
  }

  if (mode === 'before' && startEvent) {
    const name = sql.string(startEvent.name);
    const first = sql`arrayFirstIndex(x -> x = ${name}, events_deduped)`;
    const from = sql`greatest(1, ${first} - ${stepCount} + 1)`;
    return {
      sessionFilter: inStartSessions,
      eventsSlice: sql`arraySlice(
        events_deduped,
        ${from},
        ${first} - ${from} + 1
      )`,
    };
  }

  if (mode === 'between' && startEvent && endEvent) {
    return {
      sessionFilter: sql`${inStartSessions} AND session_id IN (SELECT session_id FROM end_event_sessions)`,
      eventsSlice: defaultSlice,
    };
  }

  return { sessionFilter: null, eventsSlice: defaultSlice };
}

/**
 * V1's `sessionPathsQuery`: one row per session carrying its deduped, sliced
 * event path and that path's entry event.
 */
export function sankeySessionPathsQuery(input: SankeyPathsInput): SqlFragment {
  const { sessionFilter, eventsSlice } = modeConfig(input);
  const anchorCtes: SqlFragment[] = [];
  if (input.startEvent) {
    anchorCtes.push(
      sql`start_event_sessions AS (${sessionEventCte(input.startEvent, input)})`
    );
  }
  if (input.mode === 'between' && input.endEvent) {
    anchorCtes.push(
      sql`end_event_sessions AS (${sessionEventCte(input.endEvent, input)})`
    );
  }
  const anchors =
    anchorCtes.length > 0 ? sql`${sql.join(anchorCtes)}, ` : sql.empty;

  const having = sessionFilter ?? sql`1 = 1`;
  const eventsExpr =
    input.mode === 'before' ? sql`events_sliced` : TRUNCATE_AT_REPEAT;

  return sql`WITH ${anchors}events_deduped_cte AS (WITH ordered_events AS (SELECT session_id, name as event_name, created_at FROM ${sql.id(CHART_TABLE.events)} WHERE ${dateRange(input)}${eventNameFilter(input)} ORDER BY session_id ASC, created_at ASC) SELECT session_id, ${DEDUPE_CONSECUTIVE} FROM ordered_events GROUP BY session_id), events_sliced_cte AS (SELECT session_id, ${eventsSlice} as events_sliced FROM events_deduped_cte HAVING ${having}) SELECT session_id, ${eventsExpr} as events, events[1] as entry_event FROM events_sliced_cte HAVING length(events) >= ${sql.uint64(MIN_PATH_LENGTH)}`;
}

/** `between` mode narrows each path to the slice from the start to the end event. */
function betweenSessionsQuery(
  input: SankeyPathsInput,
  startEvent: SankeyEvent,
  endEvent: SankeyEvent
): SqlFragment {
  return sql`WITH session_paths AS (${sankeySessionPathsQuery(input)}) SELECT session_id, events, arrayFirstIndex(x -> x = ${sql.string(startEvent.name)}, events) as start_index, arrayFirstIndex(x -> x = ${sql.string(endEvent.name)}, events) as end_index FROM session_paths HAVING start_index > 0 AND end_index > 0 AND start_index < end_index`;
}

const BETWEEN_SLICE = compiledText(
  'arraySlice(events, start_index, end_index - start_index + 1)'
);

function topEntriesFrom(sessionPaths: SqlFragment): SqlFragment {
  return sql`WITH session_paths AS (${sessionPaths}) SELECT entry_event, count() as count FROM session_paths GROUP BY entry_event ORDER BY count DESC LIMIT ${sql.uint64(TOP_ENTRY_EVENTS)}`;
}

function transitionsFrom(
  baseCteName: string,
  baseQuery: SqlFragment,
  pathsSelect: SqlFragment,
  topEntryEvents: string[]
): SqlFragment {
  return sql`WITH ${compiledText(baseCteName)} AS (${baseQuery}), session_paths AS (SELECT ${pathsSelect} FROM ${compiledText(baseCteName)} HAVING events[1] IN ${sql.array('String', topEntryEvents)}) SELECT pair.1 as source, pair.2 as target, pair.3 as step, count() as value FROM (${TRANSITION_PAIRS}) GROUP BY source, target, step ORDER BY step ASC, value DESC`;
}

/** `after` / `before` modes: top entry events straight off the session paths. */
export function sankeyTopEntriesQuery(input: SankeyPathsInput): SqlFragment {
  return topEntriesFrom(sankeySessionPathsQuery(input));
}

export function sankeyTransitionsQuery(
  input: SankeyPathsInput,
  topEntryEvents: string[]
): SqlFragment {
  return transitionsFrom(
    'session_paths_base',
    sankeySessionPathsQuery(input),
    sql`session_id, events`,
    topEntryEvents
  );
}

/** `between` mode: the same two statements over the start→end slice. */
export function sankeyBetweenTopEntriesQuery(
  input: SankeyPathsInput,
  startEvent: SankeyEvent,
  endEvent: SankeyEvent
): SqlFragment {
  const betweenPaths = sql`WITH between_sessions AS (${betweenSessionsQuery(input, startEvent, endEvent)}) SELECT session_id, ${BETWEEN_SLICE} as events, events[start_index] as entry_event FROM between_sessions`;
  return topEntriesFrom(betweenPaths);
}

export function sankeyBetweenTransitionsQuery(
  input: SankeyPathsInput,
  startEvent: SankeyEvent,
  endEvent: SankeyEvent,
  topEntryEvents: string[]
): SqlFragment {
  return transitionsFrom(
    'between_sessions',
    betweenSessionsQuery(input, startEvent, endEvent),
    sql`session_id, ${BETWEEN_SLICE} as events`,
    topEntryEvents
  );
}
