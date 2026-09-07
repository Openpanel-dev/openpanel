// The ONE place the chart module splices pre-compiled SQL text.
//
// field-resolution.ts is V1's field resolver, still rendering sqlstring-escaped
// text: ADR-013 leaves it as it is until its own conversion (M12-003). Every
// chart-level value is bound in chart.sql.ts and every filter value is bound by
// filter-where.ts (M12-002); only the field resolver's output still crosses
// here, through the same `SqlFragment` constructor `sql.id` uses — one grep away
// from deletion, not a `sql.raw()`.

import {
  isSqlFragment,
  SqlFragment,
  type SqlSlot,
} from '@openpanel/db/src/clickhouse/sql';
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

/**
 * The same rewrite over a fragment: it runs on the literal parts only and
 * never on a slot, so a bound value can no longer be rewritten even in
 * principle. That is the property `compiledTextWithProfileRefs` relied on
 * being true by accident of escaping; here it is true by construction.
 */
export function fragmentWithProfileRefs(
  fragment: SqlFragment,
  profilePropertyKeys: readonly string[]
): SqlFragment {
  if (profilePropertyKeys.length === 0) {
    return fragment;
  }
  const keys = profilePropertyKeys as string[];
  const strings = fragment.strings.map((literal) =>
    rewriteProfilePropertyRefs(literal, keys)
  );
  const slots: SqlSlot[] = fragment.slots.map((slot) =>
    isSqlFragment(slot) ? fragmentWithProfileRefs(slot, keys) : slot
  );
  return new SqlFragment(strings, slots);
}
