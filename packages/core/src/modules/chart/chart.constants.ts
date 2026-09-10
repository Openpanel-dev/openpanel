// The chart module's isomorphic surface (ADR-022 R8): limits, zod schemas and
// the column allow-lists shared by more than one file here. Imports zod and
// sibling `*.constants.ts` only — anything needing `sql`, `deps` or a
// ClickHouse type belongs in a service or a `src/` file.

import { z } from 'zod';
import { zChartEvent } from '../report/report.constants';

/** User-flow depth: how many events one sankey path may span. */
export const DEFAULT_SANKEY_STEPS = 5;
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
