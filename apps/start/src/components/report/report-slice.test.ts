import type { IReport } from '@openpanel/core/modules/report/report.constants';
import { describe, expect, test } from 'vitest';
import reducer, {
  applyDraft,
  changeConversionYAxisScale,
  changeFunnelWindow,
  changeHoldProperties,
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

describe('hold properties', () => {
  test('live on the funnel options and keep the other funnel settings', () => {
    const withWindow = reducer(funnelWithStep(2), changeFunnelWindow(48));
    const state = reducer(
      withWindow,
      changeHoldProperties(['properties.project', 'country'])
    );
    expect(state.dirty).toBe(true);
    expect(state.options).toEqual({
      type: 'funnel',
      funnelGroup: undefined,
      funnelWindow: 48,
      holdProperties: ['properties.project', 'country'],
    });
  });

  test('are unset when the last one is removed', () => {
    const held = reducer(
      funnelWithStep(2),
      changeHoldProperties(['properties.project'])
    );
    const state = reducer(held, changeHoldProperties([]));
    expect(
      state.options?.type === 'funnel' ? state.options.holdProperties : 'wrong'
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
