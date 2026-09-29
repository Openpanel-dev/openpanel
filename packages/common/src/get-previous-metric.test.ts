import { describe, expect, it } from 'vitest';
import { getPreviousMetric } from './get-previous-metric';

describe('getPreviousMetric', () => {
  it('returns undefined when there is no previous value', () => {
    expect(getPreviousMetric(10, null)).toBeUndefined();
    expect(getPreviousMetric(10, undefined)).toBeUndefined();
  });

  it('reports an increase relative to the previous value', () => {
    expect(getPreviousMetric(150, 100)).toEqual({
      diff: 50,
      state: 'positive',
      value: 100,
    });
    expect(getPreviousMetric(200, 100)).toEqual({
      diff: 100,
      state: 'positive',
      value: 100,
    });
  });

  it('reports a decrease relative to the previous value', () => {
    expect(getPreviousMetric(50, 100)).toEqual({
      diff: 50,
      state: 'negative',
      value: 100,
    });
    expect(getPreviousMetric(25, 100)).toEqual({
      diff: 75,
      state: 'negative',
      value: 100,
    });
  });

  it('reports a drop to zero as 100%', () => {
    expect(getPreviousMetric(0, 100)).toEqual({
      diff: 100,
      state: 'negative',
      value: 100,
    });
  });

  it('has no diff when the previous value is zero or unchanged', () => {
    expect(getPreviousMetric(10, 0)).toEqual({
      diff: null,
      state: 'positive',
      value: 0,
    });
    expect(getPreviousMetric(10, 10)).toEqual({
      diff: null,
      state: 'neutral',
      value: 10,
    });
  });

  it('rounds to one decimal', () => {
    expect(getPreviousMetric(2, 3)?.diff).toBe(33.3);
  });
});
