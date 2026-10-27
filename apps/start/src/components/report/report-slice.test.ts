import type { IReport } from '@openpanel/core/modules/report/report.constants';
import { describe, expect, test } from 'vitest';
import reducer, {
  applyDraft,
  changeChartType,
  changeConversionYAxisScale,
  changeFunnelWindow,
  ready,
  removeEvent,
  setReport,
} from './reportSlice';

const event = (id: string) => ({
  id,
  type: 'event' as const,
  name: id,
  segment: 'event' as const,
  filters: [],
});

function funnelWithStep(step: number) {
  return reducer(
    undefined,
    setReport({
      projectId: 'project',
      name: 'Funnel',
      chartType: 'funnel',
      lineType: 'monotone',
      interval: 'day',
      range: '30d',
      previous: false,
      metric: 'sum',
      series: [event('a'), event('b'), event('c')],
      breakdowns: [{ id: 'b0', name: 'properties.variant', step }],
    } as IReport)
  );
}

describe('breakdown step', () => {
  test('is cleared when removing a series leaves it past the last step', () => {
    const state = reducer(funnelWithStep(3), removeEvent({ id: 'c' }));
    expect(state.breakdowns[0]?.step).toBeUndefined();
  });

  test('is kept while it still points at a step', () => {
    const state = reducer(funnelWithStep(2), removeEvent({ id: 'c' }));
    expect(state.breakdowns[0]?.step).toBe(2);
  });
});

describe('conversion y-axis scale', () => {
  test('lives on the funnel options next to the funnel window', () => {
    const withWindow = reducer(funnelWithStep(2), changeFunnelWindow(48));
    const state = reducer(withWindow, changeConversionYAxisScale('auto'));
    expect(state.options).toEqual({
      type: 'funnel',
      funnelGroup: undefined,
      funnelWindow: 48,
      yAxisScale: 'auto',
    });
  });

  test('is unset for the fixed default', () => {
    const auto = reducer(funnelWithStep(2), changeConversionYAxisScale('auto'));
    const state = reducer(auto, changeConversionYAxisScale(undefined));
    expect(state.options?.type).toBe('funnel');
    expect(
      state.options?.type === 'funnel' ? state.options.yAxisScale : 'wrong'
    ).toBeUndefined();
  });
});

describe('applyDraft', () => {
  test('loads the draft as unsaved work with the editor defaults filled in', () => {
    const state = reducer(
      reducer(undefined, ready()),
      applyDraft({
        projectId: 'project',
        name: 'Purchases by device',
        chartType: 'linear',
        interval: 'day',
        range: '7d',
        previous: false,
        metric: 'sum',
        series: [event('A')],
        breakdowns: [{ id: '1', name: 'device' }],
      })
    );
    expect(state.dirty).toBe(true);
    expect(state.ready).toBe(true);
    expect(state.name).toBe('Purchases by device');
    expect(state.range).toBe('7d');
    expect(state.startDate).toBeNull();
    expect(state.lineType).toBe('monotone');
    expect(state.globalFilters).toEqual([]);
    expect(state.series).toHaveLength(1);
  });
});

describe('per-user value and segment', () => {
  const perUser = { aggregation: 'sum' as const, property: 'properties.value' };
  const report = (chartType: IReport['chartType']) =>
    ({
      projectId: 'project',
      name: 'Report',
      chartType,
      lineType: 'monotone',
      interval: 'day',
      range: '30d',
      previous: false,
      metric: 'sum',
      series: [
        { ...event('a'), segment: 'property_sum', property: 'value', perUser },
        { id: 'f', type: 'formula', formula: 'A*2' },
      ],
      breakdowns: [],
    }) as IReport;

  test('a distribution keeps the per-user value and drops the segment', () => {
    const state = reducer(undefined, setReport(report('distribution')));
    expect(state.series[0]).toMatchObject({ segment: 'event', perUser });
  });

  test('other chart types drop a saved per-user value', () => {
    const state = reducer(undefined, setReport(report('linear')));
    expect(state.series[0]).not.toHaveProperty('perUser');
    expect(state.series[0]).toMatchObject({ segment: 'property_sum' });
    expect(state.series[1]).toEqual(report('linear').series[1]);
  });

  test('switching chart type normalizes the series both ways', () => {
    const distribution = reducer(
      reducer(undefined, setReport(report('linear'))),
      changeChartType('distribution')
    );
    expect(distribution.series[0]).toMatchObject({ segment: 'event' });

    const withPerUser = reducer(undefined, setReport(report('distribution')));
    const linear = reducer(withPerUser, changeChartType('linear'));
    expect(linear.series[0]).not.toHaveProperty('perUser');
  });
});
