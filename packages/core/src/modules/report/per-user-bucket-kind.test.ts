import { describe, expect, it } from 'bun:test';
import type { IChartEventItem } from './report.constants';
import {
  mixesPerUserBucketKinds,
  requiredPerUserBucketKind,
} from './report.constants';

const serie = (
  id: string,
  aggregation?: 'count' | 'distinct_count' | 'sum'
): IChartEventItem => ({
  type: 'event',
  id,
  name: id,
  segment: 'event',
  filters: [],
  ...(aggregation ? { perUser: { aggregation } } : {}),
});
const formula: IChartEventItem = { type: 'formula', id: 'f', formula: 'A+B' };

describe('per-user bucket kinds', () => {
  it('treats counts and distinct counts as one kind', () => {
    expect(
      mixesPerUserBucketKinds([serie('a'), serie('b', 'distinct_count')])
    ).toBe(false);
  });

  it('spots counts next to binned values, ignoring formulas', () => {
    expect(mixesPerUserBucketKinds([serie('a'), serie('b', 'sum')])).toBe(true);
    expect(mixesPerUserBucketKinds([serie('a', 'sum'), formula])).toBe(false);
  });

  it('holds a series to the kind of the others', () => {
    const series = [serie('a'), serie('b', 'sum')];
    expect(requiredPerUserBucketKind(series, 'a')).toBe('binned');
    expect(requiredPerUserBucketKind(series, 'b')).toBe('fixed');
  });

  it('leaves a lone series free, and every series of a three-way mix', () => {
    expect(requiredPerUserBucketKind([serie('a')], 'a')).toBeUndefined();
    const mixed = [serie('a'), serie('b', 'sum'), serie('c')];
    expect(requiredPerUserBucketKind(mixed, 'a')).toBeUndefined();
  });
});
