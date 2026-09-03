import type { WindowKind, WindowRange } from './types';

function atUtcMidnight(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

/**
 * Convention: end is inclusive (end of day). If you prefer exclusive, adapt consistently.
 */
export function resolveWindow(kind: WindowKind, now: Date): WindowRange {
  const today0 = atUtcMidnight(now);
  const yesterday0 = addDays(today0, -1);
  if (kind === 'yesterday') {
    const start = yesterday0;
    const end = yesterday0;
    // Baseline: median of last 4 same weekdays -> engine/module implements the median.
    // Here we just define the candidate range; module queries last 28 days and filters weekday.
    const baselineStart = addDays(yesterday0, -28);
    const baselineEnd = addDays(yesterday0, -1);
    return { kind, start, end, baselineStart, baselineEnd, label: 'Yesterday' };
  }
  if (kind === 'rolling_7d') {
    const end = yesterday0;
    const start = addDays(end, -6); // 7 days inclusive
    const baselineEnd = addDays(start, -1);
    const baselineStart = addDays(baselineEnd, -6);
    return {
      kind,
      start,
      end,
      baselineStart,
      baselineEnd,
      label: 'Last 7 days',
    };
  }
  // rolling_30d
  {
    const end = yesterday0;
    const start = addDays(end, -29);
    const baselineEnd = addDays(start, -1);
    const baselineStart = addDays(baselineEnd, -29);
    return {
      kind,
      start,
      end,
      baselineStart,
      baselineEnd,
      label: 'Last 30 days',
    };
  }
}
