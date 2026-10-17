import type { IReport } from '@openpanel/core/modules/report/report.constants';
import { describe, expect, test } from 'vitest';
import reducer, { removeEvent, setReport } from './reportSlice';

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
