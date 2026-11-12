import { describe, expect, it } from 'bun:test';
import type { IChartSeries } from '../../report/report.constants';
import type { NormalizedInput } from './engine/normalize';
import { plan } from './engine/plan';
import { withEventDisplayNames } from './event-display-names';

const DISPLAY_NAMES = new Map([['signup', 'Account created']]);

const eventItem = (
  overrides: Record<string, unknown> = {}
): IChartSeries[number] =>
  ({
    type: 'event',
    id: 'A',
    name: 'signup',
    segment: 'event',
    filters: [],
    ...overrides,
  }) as IChartSeries[number];

describe('withEventDisplayNames', () => {
  it('names a series after the project display name of its event', () => {
    const [result] = withEventDisplayNames([eventItem()], DISPLAY_NAMES);
    expect(result).toMatchObject({
      name: 'signup',
      displayName: 'Account created',
    });
  });

  it('keeps the name the report gave the series', () => {
    const series = [eventItem({ displayName: 'Sign-ups' })];
    expect(withEventDisplayNames(series, DISPLAY_NAMES)).toEqual(series);
  });

  // The assistant and the MCP funnel tool send displayName === name to keep
  // their output raw.
  it('keeps a series already named after its raw event', () => {
    const series = [eventItem({ displayName: 'signup' })];
    expect(withEventDisplayNames(series, DISPLAY_NAMES)).toEqual(series);
  });

  it('leaves an event with no entry in the map untouched', () => {
    const series = [eventItem({ name: 'purchase' })];
    expect(withEventDisplayNames(series, DISPLAY_NAMES)).toEqual(series);
  });

  it('leaves custom events untouched', () => {
    const series = [eventItem({ customEventId: 'ce_1' })];
    expect(withEventDisplayNames(series, DISPLAY_NAMES)).toEqual(series);
  });

  it('leaves formulas untouched', () => {
    const series = [
      { type: 'formula', id: 'F', formula: 'A*2' },
    ] as IChartSeries;
    expect(withEventDisplayNames(series, DISPLAY_NAMES)).toEqual(series);
  });

  it('does not mutate its input', () => {
    const series = [eventItem()];
    withEventDisplayNames(series, DISPLAY_NAMES);
    expect(series[0]).not.toHaveProperty('displayName');
  });

  it('composes with the chart engine: label is renamed, event stays raw', () => {
    const series = withEventDisplayNames([eventItem()], DISPLAY_NAMES);
    const { concreteSeries } = plan({
      series,
      timezone: 'UTC',
    } as unknown as NormalizedInput);
    expect(concreteSeries[0]?.name).toEqual(['Account created']);
    expect(concreteSeries[0]?.context.event).toBe('signup');
  });
});
