import { describe, expect, it, mock } from 'bun:test';
import type { ServiceDeps } from '../../services';
import type { IChartSeries } from '../report/report.constants';
import { expandCustomEvents } from './custom-event.service';

const CUSTOM_EVENT_ID = '7f1c2a54-0000-4000-8000-000000000001';
const items = [
  { name: 'menu_open', filters: [] },
  {
    name: 'screen_view',
    filters: [{ name: 'path', operator: 'is' as const, value: ['/nav'] }],
  },
];

function depsWith(rows: unknown[]) {
  const findMany = mock(async () => rows);
  const deps = { db: { customEvent: { findMany } } } as unknown as ServiceDeps;
  return { deps, findMany };
}

// Unique per test: the list is cached in Redis by project id.
const projectId = () => `custom-event-test-${crypto.randomUUID()}`;

describe('expandCustomEvents', () => {
  it('passes series through without a lookup when none references a custom event', async () => {
    const { deps, findMany } = depsWith([]);
    const series: IChartSeries = [
      { type: 'event', name: 'sign_up', segment: 'event', filters: [] },
      { type: 'formula', formula: 'A*2' },
    ];

    expect(await expandCustomEvents(deps, projectId(), series)).toBe(series);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('replaces the reference with the current name and items', async () => {
    const { deps, findMany } = depsWith([
      { id: CUSTOM_EVENT_ID, name: 'Used navigation', items },
    ]);
    const [expanded] = await expandCustomEvents(deps, projectId(), [
      {
        type: 'event',
        name: 'Old name',
        customEventId: CUSTOM_EVENT_ID,
        segment: 'user',
        filters: [],
      },
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(expanded).toMatchObject({
      name: 'Used navigation',
      anyOf: items,
      segment: 'user',
    });
  });

  it('fails loudly when the custom event was deleted', async () => {
    const { deps } = depsWith([]);
    const expansion = expandCustomEvents(deps, projectId(), [
      {
        type: 'event',
        name: 'Gone',
        customEventId: CUSTOM_EVENT_ID,
        segment: 'event',
        filters: [],
      },
    ]);

    await expect(expansion).rejects.toThrow(
      'Custom event "Gone" no longer exists'
    );
  });
});
