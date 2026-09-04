/**
 * Locks down `getDefaultIntervalByDates`'s rewrite from date-fns
 * (differenceInDays/isSameDay) to plain Date math (see file header) against
 * the exact boundaries the original branches used.
 */
import { describe, expect, it } from 'bun:test';
import { getDefaultIntervalByDates } from './report.constants';

describe('getDefaultIntervalByDates', () => {
  it('returns null when either date is missing', () => {
    expect(getDefaultIntervalByDates(null, null)).toBeNull();
    expect(getDefaultIntervalByDates('2024-01-01', null)).toBeNull();
    expect(getDefaultIntervalByDates(null, '2024-01-01')).toBeNull();
  });

  it('returns hour for the same calendar day', () => {
    expect(getDefaultIntervalByDates('2024-01-01', '2024-01-01')).toBe('hour');
  });

  it('returns day up to 92 days apart', () => {
    expect(getDefaultIntervalByDates('2024-01-01', '2024-01-02')).toBe('day');
    expect(getDefaultIntervalByDates('2024-01-01', '2024-04-02')).toBe('day');
  });

  it('returns week between 93 and 186 days apart', () => {
    expect(getDefaultIntervalByDates('2024-01-01', '2024-04-03')).toBe('week');
    expect(getDefaultIntervalByDates('2024-01-01', '2024-07-05')).toBe('week');
  });

  it('returns month beyond 186 days apart', () => {
    expect(getDefaultIntervalByDates('2024-01-01', '2024-07-06')).toBe('month');
  });
});
