import { describe, expect, it } from 'vitest';
import { getPreviousMetric } from './get-previous-metric';

describe('getPreviousMetric', () => {
  it('should return undefined when previous is null or undefined', () => {
    expect(getPreviousMetric(100, null)).toBeUndefined();
    expect(getPreviousMetric(100, undefined)).toBeUndefined();
  });

  it('should calculate increase correctly', () => {
    expect(getPreviousMetric(100, 50)).toEqual({
      diff: 100,
      state: 'positive',
      value: 50,
    });
    expect(getPreviousMetric(150, 100)).toEqual({
      diff: 50,
      state: 'positive',
      value: 100,
    });
  });

  it('should calculate decrease correctly relative to previous value', () => {
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
    expect(getPreviousMetric(0, 100)).toEqual({
      diff: 100,
      state: 'negative',
      value: 100,
    });
  });

  it('should handle zero previous value', () => {
    expect(getPreviousMetric(100, 0)).toEqual({
      diff: null,
      state: 'positive',
      value: 0,
    });
  });

  it('should return neutral state and null diff when values are equal', () => {
    expect(getPreviousMetric(100, 100)).toEqual({
      diff: null,
      state: 'neutral',
      value: 100,
    });
  });
});
