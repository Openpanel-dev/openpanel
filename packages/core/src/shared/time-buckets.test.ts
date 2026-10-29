import { describe, expect, it } from 'bun:test';
import {
  assertTimeBucketBudget,
  countTimeBuckets,
  TimeRangeError,
} from './time-buckets';

describe('countTimeBuckets', () => {
  it('counts a dashboard range the way WITH FILL fills it', () => {
    expect(
      countTimeBuckets({
        startDate: '2026-01-01 00:00:00',
        endDate: '2026-01-30 23:59:59',
        interval: 'day',
      })
    ).toBe(30);
    expect(
      countTimeBuckets({
        startDate: '2026-01-01',
        endDate: '2026-01-30',
        interval: 'hour',
      })
    ).toBe(720);
  });

  it('counts a reversed range by its span', () => {
    expect(
      countTimeBuckets({
        startDate: '2026-01-30',
        endDate: '2026-01-01',
        interval: 'day',
      })
    ).toBe(29);
  });

  it('rejects dates ClickHouse DateTime cannot hold', () => {
    expect(() =>
      countTimeBuckets({
        startDate: '1900-01-01',
        endDate: '2026-01-01',
        interval: 'day',
      })
    ).toThrow(TimeRangeError);
    expect(() =>
      countTimeBuckets({
        startDate: '2026-01-01',
        endDate: '2200-01-01',
        interval: 'day',
      })
    ).toThrow(TimeRangeError);
    expect(() =>
      countTimeBuckets({
        startDate: 'not a date',
        endDate: '2026-01-01',
        interval: 'day',
      })
    ).toThrow(TimeRangeError);
  });
});

describe('assertTimeBucketBudget', () => {
  it('serves every range the picker offers at its finest interval', () => {
    expect(() =>
      assertTimeBucketBudget({
        startDate: '2025-01-01 00:00:00',
        endDate: '2026-01-31 23:59:59',
        interval: 'hour',
      })
    ).not.toThrow();
  });

  it('refuses a minute series over years as a 400', () => {
    let error: unknown;
    try {
      assertTimeBucketBudget({
        startDate: '2020-01-01',
        endDate: '2026-01-01',
        interval: 'minute',
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(TimeRangeError);
    expect((error as TimeRangeError).status).toBe(400);
  });
});
