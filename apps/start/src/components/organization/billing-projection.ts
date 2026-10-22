import { addDays, differenceInCalendarDays } from 'date-fns';

export interface UsageProjectionInput {
  /** Billable events counted so far this period. */
  used: number;
  limit: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}

export interface UsageProjection {
  perDay: number;
  /** Events expected by the end of the period at the current pace. */
  projectedTotal: number;
  /** The day the limit is reached at the current pace, or null if the period ends first. */
  limitReachedAt: Date | null;
}

/**
 * Straight-line projection from the average daily rate so far. The current
 * day counts as elapsed even when partially through, which biases the rate
 * low early in the day; the alternative overshoots badly on day one.
 */
export function projectUsage({
  used,
  limit,
  periodStart,
  periodEnd,
  now,
}: UsageProjectionInput): UsageProjection | null {
  const daysElapsed = differenceInCalendarDays(now, periodStart) + 1;
  const daysInPeriod = differenceInCalendarDays(periodEnd, periodStart);
  if (used <= 0 || daysElapsed <= 0 || daysInPeriod <= 0) {
    return null;
  }

  const perDay = used / daysElapsed;
  const daysRemaining = Math.max(0, daysInPeriod - daysElapsed);
  const projectedTotal = Math.round(used + perDay * daysRemaining);

  const reachesLimit = limit > 0 && used < limit && projectedTotal >= limit;
  const limitReachedAt = reachesLimit
    ? addDays(now, Math.ceil((limit - used) / perDay))
    : null;

  return { perDay, projectedTotal, limitReachedAt };
}
