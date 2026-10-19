import { describe, expect, test } from 'bun:test';
import type { ChatToolContext } from '../context';
import { buildReportConfig, summarizeChartData } from './charts';

const ctx = { projectId: 'p1', timezone: 'UTC' } as ChatToolContext;

describe('buildReportConfig', () => {
  test('letters the series so formulas can reference them', () => {
    const built = buildReportConfig(ctx, {
      title: 'Signup rate',
      chartType: 'linear',
      interval: 'day',
      startDate: '2026-10-01',
      endDate: '2026-10-19',
      series: [
        { type: 'event', name: 'screen_view', segment: 'user', filters: [] },
        { type: 'event', name: 'signup', segment: 'user', filters: [] },
        { type: 'formula', formula: 'B / A * 100', hideSeries: ['A', 'B'] },
      ],
      breakdowns: [],
    });
    expect('config' in built).toBe(true);
    if (!('config' in built)) {
      return;
    }
    expect(built.config.series.map((serie) => serie.id)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(built.config.projectId).toBe('p1');
    expect(built.config.range).toBe('custom');
    expect(built.config.name).toBe('Signup rate');
  });

  test('metric cards default to unique profiles, other charts to sum', () => {
    const base = {
      title: 't',
      interval: 'day' as const,
      startDate: '2026-10-01',
      endDate: '2026-10-19',
      series: [
        {
          type: 'event' as const,
          name: 'signup',
          segment: 'event' as const,
          filters: [],
        },
      ],
      breakdowns: [],
    };
    const metric = buildReportConfig(ctx, { ...base, chartType: 'metric' });
    const line = buildReportConfig(ctx, { ...base, chartType: 'linear' });
    expect('config' in metric && metric.config.metric).toBe('count');
    expect('config' in line && line.config.metric).toBe('sum');
  });

  test('a funnel carries its group and window as options', () => {
    const built = buildReportConfig(ctx, {
      title: 'Checkout',
      chartType: 'funnel',
      interval: 'day',
      startDate: '2026-10-01',
      endDate: '2026-10-19',
      series: [
        { type: 'event', name: 'cart', segment: 'event', filters: [] },
        { type: 'event', name: 'purchase', segment: 'event', filters: [] },
      ],
      breakdowns: [],
      funnelGroup: 'profile_id',
      funnelWindowHours: 2,
    });
    expect('config' in built && built.config.options).toEqual({
      type: 'funnel',
      funnelGroup: 'profile_id',
      funnelWindow: 7200,
    });
  });

  test('an invalid config is returned as issues the model can fix', () => {
    const built = buildReportConfig(ctx, {
      title: 'Bad',
      chartType: 'linear',
      interval: 'day',
      startDate: '2026-10-01',
      endDate: '2026-10-19',
      series: [{ type: 'formula', formula: 'A ; drop' }],
      breakdowns: [],
    });
    expect('error' in built).toBe(true);
  });
});

describe('summarizeChartData', () => {
  test('series charts collapse to totals, peaks and compact points', () => {
    const summary = summarizeChartData({
      metrics: { sum: 30, count: 3, average: 10, min: 5, max: 15 },
      series: [
        {
          id: 'a',
          names: ['screen_view'],
          event: { name: 'screen_view' },
          metrics: { sum: 30, count: 3, average: 10, min: 5, max: 15 },
          data: [
            { date: '2026-10-01', count: 5 },
            { date: '2026-10-02', count: 15 },
            { date: '2026-10-03', count: 10 },
          ],
        },
      ],
    });
    expect(summary.seriesCount).toBe(1);
    const [serie] = summary.series as Array<Record<string, unknown>>;
    expect(serie?.peak).toEqual({ date: '2026-10-02', value: 15 });
    expect(serie?.low).toEqual({ date: '2026-10-01', value: 5 });
    expect(serie?.data).toEqual([
      ['2026-10-01', 5],
      ['2026-10-02', 15],
      ['2026-10-03', 10],
    ]);
  });

  test('funnels collapse to steps', () => {
    const summary = summarizeChartData({
      totalSessions: 100,
      steps: [
        {
          event: { name: 'cart', displayName: 'Cart' },
          count: 100,
          percent: 100,
          dropoffCount: null,
          dropoffPercent: null,
        },
        {
          event: { name: 'purchase' },
          count: 25,
          percent: 25,
          dropoffCount: 75,
          dropoffPercent: 75,
        },
      ],
    });
    expect(summary.totalSessions).toBe(100);
    expect(
      (summary.steps as Array<{ event: string }>).map((step) => step.event)
    ).toEqual(['Cart', 'purchase']);
  });

  test('anything else is passed through as capped JSON', () => {
    const summary = summarizeChartData({ nodes: [], links: [] });
    expect(typeof summary.raw).toBe('string');
  });
});
