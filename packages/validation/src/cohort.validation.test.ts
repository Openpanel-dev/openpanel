import { describe, expect, it } from 'vitest';
import { zAbsoluteTimeframe } from './cohort.validation';

describe('zAbsoluteTimeframe', () => {
  it('accepts a date without an end', () => {
    expect(
      zAbsoluteTimeframe.safeParse({ type: 'absolute', start: '2024-01-01' })
        .success
    ).toBe(true);
  });

  it('accepts a date range', () => {
    expect(
      zAbsoluteTimeframe.safeParse({
        type: 'absolute',
        start: '2024-01-01',
        end: '2024-02-01',
      }).success
    ).toBe(true);
  });

  it.each([
    "2024-01-01') OR 1=1 --",
    '2024-1-1',
    'yesterday',
    '',
  ])('rejects a non-date start (%s)', (start) => {
    expect(
      zAbsoluteTimeframe.safeParse({ type: 'absolute', start }).success
    ).toBe(false);
  });

  it('rejects a non-date end', () => {
    expect(
      zAbsoluteTimeframe.safeParse({
        type: 'absolute',
        start: '2024-01-01',
        end: "2024-01-01') --",
      }).success
    ).toBe(false);
  });
});
