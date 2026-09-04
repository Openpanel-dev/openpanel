// The ONE place the chart module splices pre-compiled SQL text.
//
// field-resolution.ts and filter-where.ts are V1's field resolver and filter
// compiler, still rendering sqlstring-escaped text: ADR-013 leaves the shared
// compilers as they are ("two behaviours, not two builders") until funnel,
// conversion, sankey, retention and overview (M7-004/M7-005) stop splicing
// them into text builders. Every chart-level value is bound in chart.sql.ts;
// only the compilers' output crosses here, through the same `SqlFragment`
// constructor `sql.id` uses — one grep away from deletion, not a `sql.raw()`.

import { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import { rewriteProfilePropertyRefs } from './field-resolution';

export function compiledText(text: string): SqlFragment {
  return new SqlFragment([text], []);
}

/**
 * V1 ran `rewriteProfilePropertyRefs` over the finished query text. Bound
 * params never matched it (an escaped literal cannot contain `['`), so
 * applying it to each compiled piece before splicing is the same rewrite.
 */
export function compiledTextWithProfileRefs(
  text: string,
  profilePropertyKeys: readonly string[]
): SqlFragment {
  return compiledText(
    rewriteProfilePropertyRefs(text, profilePropertyKeys as string[])
  );
}
