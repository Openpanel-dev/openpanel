/**
 * Shared utilities for insight modules
 */

/**
 * Get UTC weekday (0 = Sunday, 6 = Saturday)
 */
export function getWeekday(date: Date): number {
  return date.getUTCDay();
}

/**
 * Compute median of a sorted array of numbers
 */
export function computeMedian(sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;
  const mid = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? ((sortedValues[mid - 1] ?? 0) + (sortedValues[mid] ?? 0)) / 2
    : (sortedValues[mid] ?? 0);
}

/**
 * Compute weekday medians from daily breakdown data.
 * Groups by dimension, filters to matching weekday, computes median per dimension.
 *
 * @param data - Array of { date, dimension, cnt } rows
 * @param targetWeekday - Weekday to filter to (0-6)
 * @param getDimension - Function to extract normalized dimension from row
 * @returns Map of dimension -> median value
 */
export function computeWeekdayMedians<T>(
  data: T[],
  targetWeekday: number,
  getDimension: (row: T) => string,
): Map<string, number> {
  // Group by dimension, filtered to target weekday
  const byDimension = new Map<string, number[]>();

  for (const row of data) {
    const rowWeekday = getWeekday(new Date((row as any).date));
    if (rowWeekday !== targetWeekday) continue;

    const dim = getDimension(row);
    const values = byDimension.get(dim) ?? [];
    values.push(Number((row as any).cnt ?? 0));
    byDimension.set(dim, values);
  }

  // Compute median per dimension
  const result = new Map<string, number>();
  for (const [dim, values] of byDimension) {
    values.sort((a, b) => a - b);
    result.set(dim, computeMedian(values));
  }

  return result;
}

/**
 * Compute change percentage between current and compare values
 */
export function computeChangePct(
  currentValue: number,
  compareValue: number,
): number {
  return compareValue > 0
    ? (currentValue - compareValue) / compareValue
    : currentValue > 0
      ? 1
      : 0;
}

/**
 * Determine direction based on change percentage
 */
export function computeDirection(
  changePct: number,
  threshold = 0.05,
): 'up' | 'down' | 'flat' {
  return changePct > threshold
    ? 'up'
    : changePct < -threshold
      ? 'down'
      : 'flat';
}

/**
 * Get end of day timestamp (23:59:59.999) for a given date.
 * Used to ensure BETWEEN queries include the full day.
 */
export function getEndOfDay(date: Date): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * Build a lookup map from query results.
 * Aggregates counts by key, handling duplicate keys by summing values.
 *
 * @param results - Array of result rows
 * @param getKey - Function to extract the key from each row
 * @param getCount - Function to extract the count from each row (defaults to 'cnt' field)
 * @returns Map of key -> aggregated count
 */
export function buildLookupMap<T>(
  results: T[],
  getKey: (row: T) => string,
  getCount: (row: T) => number = (row) => Number((row as any).cnt ?? 0),
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of results) {
    const key = getKey(row);
    const cnt = getCount(row);
    map.set(key, (map.get(key) ?? 0) + cnt);
  }
  return map;
}

/**
 * Select top-N dimensions by ranking on greatest(current, baseline).
 * This preserves union behavior: dimensions with high values in either period are included.
 *
 * @param currentMap - Map of dimension -> current value
 * @param baselineMap - Map of dimension -> baseline value
 * @param maxDims - Maximum number of dimensions to return
 * @returns Array of dimension keys, ranked by greatest(current, baseline)
 */
export function selectTopDimensions(
  currentMap: Map<string, number>,
  baselineMap: Map<string, number>,
  maxDims: number,
): string[] {
  // Merge all dimensions from both maps
  const allDims = new Set<string>();
  for (const dim of currentMap.keys()) allDims.add(dim);
  for (const dim of baselineMap.keys()) allDims.add(dim);

  // Rank by greatest(current, baseline)
  const ranked = Array.from(allDims)
    .map((dim) => ({
      dim,
      maxValue: Math.max(currentMap.get(dim) ?? 0, baselineMap.get(dim) ?? 0),
    }))
    .sort((a, b) => b.maxValue - a.maxValue)
    .slice(0, maxDims)
    .map((x) => x.dim);

  return ranked;
}
