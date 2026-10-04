// Replaces utils/math.test.ts: the `shortId` it covered moved to
// @openpanel/shared and is tested there (packages/core/src/shared/id.test.ts).
// What is left in this file is the one helper that stays duplicated between the
// dashboard and core, so it is the one worth a test here.
import { describe, expect, test } from 'vitest';
import { getPreviousMetric } from './previous-metric';

describe('getPreviousMetric', () => {
  test('is undefined without a previous value', () => {
    expect(getPreviousMetric(5, undefined)).toBeUndefined();
    expect(getPreviousMetric(5, null)).toBeUndefined();
  });

  test('reports growth as a positive percentage', () => {
    expect(getPreviousMetric(100, 50)).toEqual({
      diff: 100,
      state: 'positive',
      value: 50,
    });
  });

  test('reports a drop as negative, relative to the previous value', () => {
    expect(getPreviousMetric(50, 100)).toEqual({
      diff: 50,
      state: 'negative',
      value: 100,
    });
    expect(getPreviousMetric(4, 10)).toEqual({
      diff: 60,
      state: 'negative',
      value: 10,
    });
  });

  test('an unchanged value is neutral with no diff', () => {
    expect(getPreviousMetric(10, 10)).toEqual({
      diff: null,
      state: 'neutral',
      value: 10,
    });
  });

  test('a previous value of zero keeps the direction but drops the diff', () => {
    expect(getPreviousMetric(5, 0)).toEqual({
      diff: null,
      state: 'positive',
      value: 0,
    });
  });

  test('a drop to zero is a full drop', () => {
    expect(getPreviousMetric(0, 5)).toEqual({
      diff: 100,
      state: 'negative',
      value: 5,
    });
  });
});
