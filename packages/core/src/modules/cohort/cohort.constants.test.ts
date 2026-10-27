import { describe, expect, test } from 'bun:test';
import {
  zAbsoluteTimeframe,
  zEventCriteria,
  zFrequency,
} from './cohort.constants';

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

describe('zEventCriteria filters', () => {
  const criteria = (name: string) => ({
    name: 'purchase',
    timeframe: { type: 'relative', value: '30d' },
    filters: [{ id: 'f', name, operator: 'is', value: ['x'] }],
  });

  test.each([
    'path',
    'has_profile',
    'properties.plan',
    'profile.email',
    'profile.properties.plan',
    'session.entry_path',
  ])('accepts a filter the events table can evaluate (%s)', (name) => {
    expect(zEventCriteria.safeParse(criteria(name)).success).toBe(true);
  });

  // Group and wildcard profile filters read joins only the chart engine
  // builds; letting them through would fail the refresh job in ClickHouse.
  test.each([
    'group.name',
    'group.properties.tier',
    'profile.properties.*',
  ])('rejects a filter that needs a join (%s)', (name) => {
    const result = zEventCriteria.safeParse(criteria(name));
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      'group properties or wildcard profile properties'
    );
  });
});
