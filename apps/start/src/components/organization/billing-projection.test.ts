import { describe, expect, it } from 'vitest';
import { projectUsage } from './billing-projection';

const periodStart = new Date('2026-10-01T00:00:00');
const periodEnd = new Date('2026-11-01T00:00:00');

describe('projectUsage', () => {
  it('extrapolates the average daily rate over the remaining days', () => {
    // 22 days in, 22k used → 1k/day, 9 days left.
    const projection = projectUsage({
      used: 22_000,
      limit: 100_000,
      periodStart,
      periodEnd,
      now: new Date('2026-10-22T15:00:00'),
    });
    expect(projection).toEqual({
      perDay: 1000,
      projectedTotal: 31_000,
      limitReachedAt: null,
    });
  });

  it('names the day the limit is reached when the pace overshoots it', () => {
    // 80k in 22 days ≈ 3,636/day → 20k left takes 6 more days.
    const projection = projectUsage({
      used: 80_000,
      limit: 100_000,
      periodStart,
      periodEnd,
      now: new Date('2026-10-22T15:00:00'),
    });
    expect(projection?.projectedTotal).toBe(112_727);
    expect(projection?.limitReachedAt).toEqual(new Date('2026-10-28T15:00:00'));
  });

  it('does not name a day once the limit is already exceeded', () => {
    const projection = projectUsage({
      used: 120_000,
      limit: 100_000,
      periodStart,
      periodEnd,
      now: new Date('2026-10-22T15:00:00'),
    });
    expect(projection?.limitReachedAt).toBeNull();
  });

  it('treats the first day as one elapsed day instead of dividing by zero', () => {
    const projection = projectUsage({
      used: 500,
      limit: 100_000,
      periodStart,
      periodEnd,
      now: new Date('2026-10-01T09:00:00'),
    });
    expect(projection?.perDay).toBe(500);
    expect(projection?.projectedTotal).toBe(15_500);
  });

  it('returns null without usage or a sane period', () => {
    const now = new Date('2026-10-22T15:00:00');
    expect(
      projectUsage({ used: 0, limit: 100_000, periodStart, periodEnd, now })
    ).toBeNull();
    expect(
      projectUsage({
        used: 10,
        limit: 100_000,
        periodStart: periodEnd,
        periodEnd: periodStart,
        now,
      })
    ).toBeNull();
  });
});
