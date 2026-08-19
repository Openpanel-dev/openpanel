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
 * MAX_LOOKBACK_DAYS replaces the callers' built-in ceilings with a single
 * human-sized value (1 / 7 / 365 / ...). Unset or invalid (non-numeric,
 * zero, negative) keeps each caller's own default — behavior is unchanged
 * unless the variable is set.
 */
export function resolveMaxLookbackDays(defaultDays: number): number {
  const raw = process.env.MAX_LOOKBACK_DAYS;
  if (!raw || !/^\d+$/.test(raw)) {
    return defaultDays;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : defaultDays;
}
