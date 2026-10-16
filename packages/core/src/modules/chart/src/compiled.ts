// The ONE place the chart module splices pre-compiled SQL text: names the chart
// builders generate themselves (CTE names, `b_<n>` / `label_<n>` aliases, a
// `toStartOf*` keyword, the backtick-quoted `profile.properties.<key>` CTE
// alias), none of which is a value and none of which `sql.id` can express. It
// stays a named export in one file, not a `sql.raw()`, so the census is a grep.

import {
  isSqlFragment,
  SqlFragment,
  type SqlSlot,
} from '@openpanel/db/src/clickhouse/sql';

const PROFILE_PROPERTY_MAP_OPEN = 'profile.properties[';
const PROFILE_PROPERTY_MAP_CLOSE = ']';

export function compiledText(text: string): SqlFragment {
  return new SqlFragment([text], []);
}

/** `` `profile.properties.<key>` `` — the narrowed CTE column for `key`. */
function narrowedProfileColumn(key: string): string {
  return `\`profile.properties.${key}\``;
}

/**
 * Rewrite `profile.properties['<key>']` -> `` `profile.properties.<key>` ``
 * for the narrowed keys. This never matches a value, because an escaped
 * literal cannot contain `['`.
 */
export function rewriteProfilePropertyRefs(
  sql: string,
  keys: string[]
): string {
  let out = sql;
  for (const k of keys) {
    out = out
      .split(`${PROFILE_PROPERTY_MAP_OPEN}'${k}'${PROFILE_PROPERTY_MAP_CLOSE}`)
      .join(narrowedProfileColumn(k));
  }
  return out;
}

/** The key a narrowable `properties[<key>]` param carries, or null. */
function narrowableKey(slot: SqlSlot, keys: string[]): string | null {
  if (isSqlFragment(slot) || slot.type !== 'String') {
    return null;
  }
  const { value } = slot;
  return typeof value === 'string' && keys.includes(value) ? value : null;
}

/**
 * Splice nested fragments into one flat (literals, params) interleaving, so
 * "the literal immediately before this param" is answerable, which the rewrite
 * below needs because `sql.id` contributes a nested fragment of its own.
 */
function flatten(
  fragment: SqlFragment,
  strings: string[],
  slots: SqlSlot[]
): void {
  if (strings.length === 0) {
    strings.push('');
  }
  for (const [index, literal] of fragment.strings.entries()) {
    strings[strings.length - 1] += literal;
    const slot = fragment.slots[index];
    if (!slot) {
      continue;
    }
    if (isSqlFragment(slot)) {
      flatten(slot, strings, slots);
      continue;
    }
    slots.push(slot);
    strings.push('');
  }
}

/**
 * The same rewrite over a fragment: on the literal parts, and on the literal
 * `profile.properties[` followed by the key as a bound `String` param and a
 * closing `]`. Collapsing those pieces keeps a narrowed ref pointing at the
 * CTE's scalar column. Only a param in that exact position is eligible, and it
 * is replaced by an identifier rather than edited.
 */
export function fragmentWithProfileRefs(
  fragment: SqlFragment,
  profilePropertyKeys: readonly string[]
): SqlFragment {
  if (profilePropertyKeys.length === 0) {
    return fragment;
  }
  const keys = profilePropertyKeys as string[];
  const flatStrings: string[] = [];
  const flatSlots: SqlSlot[] = [];
  flatten(fragment, flatStrings, flatSlots);

  const strings: string[] = [];
  const slots: SqlSlot[] = [];
  let pending = rewriteProfilePropertyRefs(flatStrings[0] ?? '', keys);

  for (const [index, slot] of flatSlots.entries()) {
    const next = rewriteProfilePropertyRefs(flatStrings[index + 1] ?? '', keys);
    const key = narrowableKey(slot, keys);
    if (
      key !== null &&
      pending.endsWith(PROFILE_PROPERTY_MAP_OPEN) &&
      next.startsWith(PROFILE_PROPERTY_MAP_CLOSE)
    ) {
      pending =
        pending.slice(0, -PROFILE_PROPERTY_MAP_OPEN.length) +
        narrowedProfileColumn(key) +
        next.slice(PROFILE_PROPERTY_MAP_CLOSE.length);
      continue;
    }
    strings.push(pending);
    slots.push(slot);
    pending = next;
  }

  strings.push(pending);
  return new SqlFragment(strings, slots);
}
