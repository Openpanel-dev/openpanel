import { describe, expect, it, mock } from 'bun:test';
import { randomUUID } from 'node:crypto';
import type { ServiceDeps } from '../../../services';
import type { IChartSeries } from '../../report/report.constants';
import type { NormalizedInput } from './engine/normalize';
import { plan } from './engine/plan';
import {
  applyEventDisplayNames,
  withEventDisplayNames,
} from './event-display-names';

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

describe('applyEventDisplayNames', () => {
  const setup = (metas: { name: string; displayName: string | null }[]) => {
    const findMany = mock(async () => metas);
    const deps = { db: { eventMeta: { findMany } } } as unknown as ServiceDeps;
    return { deps, findMany, projectId: `proj_display_names_${randomUUID()}` };
  };

  it('names a series with no displayName from the project metas', async () => {
    const { deps, projectId } = setup([
      { name: 'signup', displayName: 'Account created' },
    ]);
    const [result] = await applyEventDisplayNames(deps, projectId, [
      eventItem(),
    ]);
    expect(result).toMatchObject({ displayName: 'Account created' });
  });

  it('keeps a displayName already set on the series', async () => {
    const { deps, projectId } = setup([
      { name: 'signup', displayName: 'Account created' },
    ]);
    const series = [eventItem({ displayName: 'Sign-ups' })];
    const [result] = await applyEventDisplayNames(deps, projectId, series);
    expect(result).toMatchObject({ displayName: 'Sign-ups' });
  });

  it('returns the same series array when no meta has a displayName', async () => {
    const { deps, findMany, projectId } = setup([
      { name: 'signup', displayName: null },
    ]);
    const series = [eventItem()];
    expect(await applyEventDisplayNames(deps, projectId, series)).toBe(series);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('leaves an event with no meta unnamed', async () => {
    const { deps, projectId } = setup([
      { name: 'signup', displayName: 'Account created' },
    ]);
    const [result] = await applyEventDisplayNames(deps, projectId, [
      eventItem({ name: 'purchase' }),
    ]);
    expect(result).not.toHaveProperty('displayName');
  });

  it('asks for the metas of the given project', async () => {
    const { deps, findMany, projectId } = setup([]);
    await applyEventDisplayNames(deps, projectId, [eventItem()]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({ where: { projectId } });
  });
});
