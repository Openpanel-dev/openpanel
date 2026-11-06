import { describe, expect, test } from 'vitest';
import { seriesMetricColumns } from './series-metric-columns';

describe('seriesMetricColumns', () => {
  test('a distribution shows only its number of users', () => {
    expect(seriesMetricColumns('distribution')).toEqual([
      { key: 'count', header: 'Users' },
    ]);
  });

  test('time-series charts keep every summary metric', () => {
    expect(seriesMetricColumns('linear').map((column) => column.key)).toEqual([
      'count',
      'sum',
      'average',
      'min',
      'max',
    ]);
  });
});
