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
export function computeWeekdayMedians<
  T extends { date: string; cnt: number | string },
>(
  data: T[],
  targetWeekday: number,
  getDimension: (row: T) => string,
): Map<string, number> {
  // Group by dimension, filtered to target weekday
  const byDimension = new Map<string, number[]>();

  for (const row of data) {
    const rowWeekday = getWeekday(new Date(row.date));
    if (rowWeekday !== targetWeekday) continue;

    const dim = getDimension(row);
    const values = byDimension.get(dim) ?? [];
    values.push(Number(row.cnt ?? 0));
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
 * Merge dimension sets from current and baseline to detect new/gone dimensions
 */
export function mergeDimensionSets(
  currentDims: Set<string>,
  baselineDims: Set<string>,
): string[] {
  const merged = new Set<string>();
  for (const dim of currentDims) merged.add(dim);
  for (const dim of baselineDims) merged.add(dim);
  return Array.from(merged);
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
