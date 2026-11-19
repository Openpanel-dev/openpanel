import { describe, expect, it } from 'bun:test';
import {
  chartSegments,
  type IChartBreakdown,
  type IChartEventSegment,
  zChartEventSegment,
} from '../../report/report.constants';
import {
  aggregateChartQuery,
  type ChartSeriesQueryInput,
  chartSeriesQuery,
} from './sql';

const input = (
  overrides: Partial<ChartSeriesQueryInput> = {}
): ChartSeriesQueryInput => ({
  event: { name: 'screen_view', segment: 'device', filters: [] },
  breakdowns: [],
  allCohorts: [],
  cohortMetadata: new Map(),
  interval: 'day',
  startDate: '2026-04-14 00:00:00',
  endDate: '2026-05-15 00:00:00',
  projectId: 'test-device-segment',
  timezone: 'UTC',
  ...overrides,
});

const breakdown = (name: string): IChartBreakdown => ({ id: name, name });

describe('chart SQL / device segment', () => {
  it('exposes device through the shared label and validation schema', () => {
    expect(chartSegments.device).toBe('Unique devices');
    for (const segment of Object.keys(chartSegments)) {
      expect(zChartEventSegment.parse(segment)).toBe(segment);
    }
    expect(zChartEventSegment.safeParse('unsupported-segment').success).toBe(
      false
    );
  });

  it('uses device_id for series count and range total without breakdowns', () => {
    const query = chartSeriesQuery(input()).toStatement().query;

    expect(query).toContain('countDistinct(device_id) as count');
    expect(query).toContain('uniqState(device_id) as _uc_state');
    expect(query).not.toContain('uniqState(profile_id) as _uc_state');
    expect(query).toContain('uniqMerge(_uc_state) OVER () as total_count');
    expect(query).not.toContain('_uc AS (');
    expect(query.match(/FROM events e/g)).toHaveLength(1);
  });

  it('partitions the device range total by every breakdown label', () => {
    const query = chartSeriesQuery(
      input({ breakdowns: [breakdown('country'), breakdown('browser')] })
    ).toStatement().query;

    expect(query).toContain('countDistinct(device_id) as count');
    expect(query).toContain('uniqState(device_id) as _uc_state');
    expect(query).not.toContain('uniqState(profile_id) as _uc_state');
    expect(query).toContain(
      'uniqMerge(_uc_state) OVER (PARTITION BY label_1, label_2) as total_count'
    );
    expect(query).not.toContain('_uc AS (');
    expect(query).not.toContain('LEFT ANY JOIN _uc');
    expect(query.match(/FROM events e/g)).toHaveLength(1);
  });

  it('uses device_id for the aggregate count with a breakdown', () => {
    const query = aggregateChartQuery(
      input({ breakdowns: [breakdown('country')] })
    ).toStatement().query;

    expect(query).toContain('countDistinct(device_id) as count');
    expect(query).not.toContain('countDistinct(profile_id) as count');
  });

  const existingSegments: [IChartEventSegment, string][] = [
    ['event', 'count(*) as count'],
    ['user', 'countDistinct(profile_id) as count'],
    ['session', 'countDistinct(session_id) as count'],
    ['user_average', 'COUNT(*)::float / COUNT(DISTINCT profile_id)::float as count'],
  ];

  for (const [segment, expression] of existingSegments) {
    it(`preserves the ${segment} count and profile-based range total`, () => {
      const args = input({
        event: { name: 'screen_view', segment, filters: [] },
      });
      const series = chartSeriesQuery(args).toStatement().query;
      const aggregate = aggregateChartQuery(args).toStatement().query;

      expect(series).toContain(expression);
      expect(aggregate).toContain(expression);
      expect(series).toContain('uniqState(profile_id) as _uc_state');
      expect(series).not.toContain('uniqState(device_id) as _uc_state');
      expect(series).not.toContain('countDistinct(device_id) as count');
      expect(aggregate).not.toContain('countDistinct(device_id) as count');
    });
  }
});
