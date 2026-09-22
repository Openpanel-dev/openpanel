import { describe, expect, it } from 'vitest';
import { zReportOptions } from './index';

describe('bar report display options', () => {
  it('retains the configured row count when validating a saved report', () => {
    expect(zReportOptions.parse({ type: 'bar', displayLimit: 25 })).toEqual({
      type: 'bar',
      displayLimit: 25,
    });
  });

  it('defaults to ten rows', () => {
    expect(zReportOptions.parse({ type: 'bar' })).toEqual({
      type: 'bar',
      displayLimit: 10,
    });
  });

  it.each([
    0,
    -1,
    1.5,
    501,
    Number.POSITIVE_INFINITY,
    Number.NaN,
  ])('rejects invalid row count %s', (displayLimit) => {
    expect(
      zReportOptions.safeParse({ type: 'bar', displayLimit }).success
    ).toBe(false);
  });
});
