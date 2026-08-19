/**
 * Ceiling (in days) for the empty-result lookback expansion on the event and
 * session lists.
 *
 * When a cursor window matches nothing, those lists double the window and
 * retry until the ceiling is reached. The doubling geometry keeps the total
 * cost at roughly 2x the final window, so the ceiling is what actually
 * bounds the worst case: with a filter no index can prune (e.g. a
 * properties value) that matches nothing at all, every step is a full scan
 * of its window, and a multi-year ceiling turns one page view into minutes
 * of scanning.
 *
 * Each list has its own variable (EVENT_LIST_MAX_LOOKBACK_DAYS,
 * SESSION_LIST_MAX_LOOKBACK_DAYS) because their built-in ceilings differ —
 * the surfaces have different cost profiles and a shared knob would couple
 * them. Values are human-sized day counts (1 / 7 / 365 / ...); unset or
 * invalid (non-integer, zero, negative) keeps the caller's default, so
 * behavior is unchanged unless a variable is set.
 */
export function resolveMaxLookbackDays(
  envName: string,
  defaultDays: number
): number {
  const raw = process.env[envName];
  if (!raw || !/^\d+$/.test(raw)) {
    return defaultDays;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : defaultDays;
}
