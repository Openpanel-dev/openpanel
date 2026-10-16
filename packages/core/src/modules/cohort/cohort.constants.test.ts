import { describe, expect, test } from 'bun:test';
import { zAbsoluteTimeframe, zFrequency } from './cohort.constants';

describe('zAbsoluteTimeframe', () => {
  test('accepts a date without an end', () => {
    expect(
      zAbsoluteTimeframe.safeParse({ type: 'absolute', start: '2024-01-01' })
        .success
    ).toBe(true);
  });

  test('accepts a date range', () => {
    expect(
      zAbsoluteTimeframe.safeParse({
        type: 'absolute',
        start: '2024-01-01',
        end: '2024-02-01',
      }).success
    ).toBe(true);
  });

  test.each([
    "2024-01-01') OR 1=1 --",
    '2024-1-1',
    'yesterday',
    '',
  ])('rejects a non-date start (%s)', (start) => {
    expect(
      zAbsoluteTimeframe.safeParse({ type: 'absolute', start }).success
    ).toBe(false);
  });

  test('rejects a non-date end', () => {
    expect(
      zAbsoluteTimeframe.safeParse({
        type: 'absolute',
        start: '2024-01-01',
        end: "2024-01-01') --",
      }).success
    ).toBe(false);
  });
});

describe('zFrequency', () => {
  test.each([
    'eq',
    'lte',
  ] as const)('accepts a count of 0 with %s ("never did this event")', (operator) => {
    expect(zFrequency.safeParse({ operator, count: 0 }).success).toBe(true);
  });

  test('rejects a count of 0 with gte, which would match every profile', () => {
    expect(zFrequency.safeParse({ operator: 'gte', count: 0 }).success).toBe(
      false
    );
  });

  test.each([
    'gte',
    'eq',
    'lte',
  ] as const)('still accepts positive counts with %s', (operator) => {
    expect(zFrequency.safeParse({ operator, count: 3 }).success).toBe(true);
  });

  test('still rejects negative and fractional counts', () => {
    expect(zFrequency.safeParse({ operator: 'eq', count: -1 }).success).toBe(
      false
    );
    expect(zFrequency.safeParse({ operator: 'eq', count: 1.5 }).success).toBe(
      false
    );
  });
});
