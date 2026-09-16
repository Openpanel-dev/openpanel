// The chart module's isomorphic surface (ADR-022 R8): limits, zod schemas and
// the column allow-lists shared by more than one file here. Imports zod and
// sibling `*.constants.ts` only — anything needing `sql`, `deps` or a
// ClickHouse type belongs in a service or a `src/` file.

import { z } from 'zod';
import { zChartEvent } from '../report/report.constants';

/**
 * Window the REST retention routes (`/insights/:projectId/retention`,
 * `/engagement`) read when the caller names none; M31-003's default for the
 * same fix, wider than engagement's 60-day churn bucket. Not applied to
 * callers of the service that pass no dates: those still read all time.
 */
export const RETENTION_SERIES_DEFAULT_RANGE = '3m';

/** User-flow depth: how many events one sankey path may span. */
export const DEFAULT_SANKEY_STEPS = 5;

/**
 * Longest window `chart.sankey` will answer, in days.
 *
 * Both of its statements scan every event in the range and hold one
 * `groupArray` per session, so cost is linear in the window and `steps` bounds
 * the answer rather than the work. Measured on the local production copy
 * (2026-09-16, `bayse`, mode `after`, 3 steps, `use_query_condition_cache=0`),
 * per statement: 871 ms / 515 MiB at 7 days, 2,361 ms / 1,329 MiB at 30,
 * 3,832 ms / 2,060 MiB at 56 - about 60 ms and 31 MiB per day. The range
 * picker offers `12m` and `lastYear`, which extrapolates to ~22 s and
 * ~11.8 GiB per statement, twice per call: past what a node can answer at all.
 *
 * 93 is the widest span the picker's `3m` option can produce - the 92-day
 * June-August quarter plus the half-open end-of-day boundary
 * `getDatesFromRange` adds - so every option up to `3m` is served and `6m`,
 * `12m`, `lastYear` and a long `yearToDate` or `custom` are refused. Refused,
 * not silently shortened: see `assertSankeyWindowIsAnswerable` in
 * sankey.service.ts, applied by `getSankeyChart`.
 */
export const MAX_SANKEY_WINDOW_DAYS = 93;
const MIN_SANKEY_STEPS = 2;
const MAX_SANKEY_STEPS = 10;

export const zGetSankeyInput = z.object({
  projectId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  steps: z
    .number()
    .min(MIN_SANKEY_STEPS)
    .max(MAX_SANKEY_STEPS)
    .default(DEFAULT_SANKEY_STEPS),
  mode: z.enum(['between', 'after', 'before']),
  startEvent: zChartEvent,
  endEvent: zChartEvent.optional(),
  exclude: z.array(z.string()).default([]),
  include: z.array(z.string()).optional(),
});

export type IGetSankeyInput = z.infer<typeof zGetSankeyInput> & {
  timezone: string;
};

/**
 * Top-level `profiles` columns a `profile.<field>` reference may resolve to,
 * in V1's order. Both halves of the chart path read this one list: the SELECT
 * side (`getProfilePropertySelect`, src/field-resolution.ts) and the filter
 * side (`profileColumnSql`, src/table-filter-where.ts). Anything outside it is
 * not a column name and must never reach the SQL text.
 */
export const PROFILE_SELECT_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'avatar',
  'created_at',
  'last_seen_at',
];

/**
 * Profile columns the funnel's and conversion's `profiles` join may expose
 * beyond the `properties` Map. Narrower than PROFILE_SELECT_COLUMNS: those two
 * statements join per event row, so `id` and `avatar` are never selected.
 */
export const JOINABLE_PROFILE_COLUMNS = [
  'email',
  'first_name',
  'last_name',
  'created_at',
  'last_seen_at',
];
