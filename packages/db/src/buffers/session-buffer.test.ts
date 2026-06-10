import { getRedisCache } from '@openpanel/redis';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ch } from '../clickhouse/client';

vi.mock('../clickhouse/client', () => ({
  ch: {
    insert: vi.fn().mockResolvedValue(undefined),
  },
  TABLE_NAMES: {
    sessions: 'sessions',
  },
}));

import { SessionBuffer } from './session-buffer';
import type { IClickhouseEvent } from '../services/event.service';

const redis = getRedisCache();

function makeEvent(overrides: Partial<IClickhouseEvent>): IClickhouseEvent {
  return {
    id: 'event-1',
    project_id: 'project-1',
    profile_id: 'profile-1',
    device_id: 'device-1',
    session_id: 'session-1',
    name: 'screen_view',
    path: '/home',
    origin: '',
    referrer: '',
    referrer_name: '',
    referrer_type: '',
    duration: 0,
    properties: {},
    created_at: new Date().toISOString(),
    groups: [],
    ...overrides,
  } as IClickhouseEvent;
}

beforeEach(async () => {
  const keys = [
    ...await redis.keys('session*'),
    ...await redis.keys('lock:session'),
  ];
  if (keys.length > 0) await redis.del(...keys);
  vi.mocked(ch.insert).mockResolvedValue(undefined as any);
});

afterAll(async () => {
  try {
    await redis.quit();
  } catch {}
});

describe('SessionBuffer', () => {
  let sessionBuffer: SessionBuffer;

  beforeEach(() => {
    sessionBuffer = new SessionBuffer();
  });

  it('adds a new session to the buffer', async () => {
    const sizeBefore = await sessionBuffer.getBufferSize();
    await sessionBuffer.add(makeEvent({}));
    const sizeAfter = await sessionBuffer.getBufferSize();

    expect(sizeAfter).toBe(sizeBefore + 1);
  });

  it('skips session_start and session_end events', async () => {
    const sizeBefore = await sessionBuffer.getBufferSize();
    await sessionBuffer.add(makeEvent({ name: 'session_start' }));
    await sessionBuffer.add(makeEvent({ name: 'session_end' }));
    const sizeAfter = await sessionBuffer.getBufferSize();

    expect(sizeAfter).toBe(sizeBefore);
  });

  it('updates existing session on subsequent events', async () => {
    const t0 = Date.now();
    await sessionBuffer.add(makeEvent({ created_at: new Date(t0).toISOString() }));

    // Second event updates the same session — emits old (sign=-1) + new (sign=1)
    const sizeBefore = await sessionBuffer.getBufferSize();
    await sessionBuffer.add(makeEvent({ created_at: new Date(t0 + 5000).toISOString() }));
    const sizeAfter = await sessionBuffer.getBufferSize();

    expect(sizeAfter).toBe(sizeBefore + 2);
  });

  it('processes buffer and inserts sessions into ClickHouse', async () => {
    await sessionBuffer.add(makeEvent({}));

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await sessionBuffer.processBuffer();

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'sessions', format: 'JSONEachRow' })
    );
    expect(await sessionBuffer.getBufferSize()).toBe(0);

    insertSpy.mockRestore();
  });

  it('squash does not orphan the creation row when create + updates share a batch', async () => {
    // Regression: a brand-new session whose creation event and subsequent
    // updates all land in one flush window. getSession emits (+1,v1) for the
    // creation then (-1,vN)/(+1,vN+1) pairs for each update. The squash must
    // net per version so nothing is left un-collapsible: a (-1,V) row only
    // collapses against a (+1,V) of the SAME version in CH.
    const t0 = Date.now();
    const EVENTS = 8;
    for (let i = 0; i < EVENTS; i++) {
      await sessionBuffer.add(
        makeEvent({ created_at: new Date(t0 + i * 1000).toISOString() }),
      );
    }

    const inserted: Array<{ sign: number; version: number }> = [];
    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockImplementation(async ({ values }: any) => {
        for (const v of values) {
          inserted.push({ sign: v.sign, version: v.version });
        }
        return undefined as any;
      });

    await sessionBuffer.processBuffer();

    // Net the inserted rows per version exactly as CH's
    // VersionedCollapsingMergeTree(sign, version) would: a row survives only
    // if positives and negatives at its version don't cancel.
    const netByVersion = new Map<number, number>();
    for (const { sign, version } of inserted) {
      netByVersion.set(version, (netByVersion.get(version) ?? 0) + sign);
    }
    const survivors = [...netByVersion.entries()].filter(([, net]) => net !== 0);

    // A fresh session must collapse to exactly one final +1 row, with no
    // orphaned negatives (the bug left a permanent (-1, v1)).
    expect(survivors).toEqual([[EVENTS, 1]]);

    insertSpy.mockRestore();
  });

  it('retains sessions in queue when ClickHouse insert fails', async () => {
    await sessionBuffer.add(makeEvent({}));

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockRejectedValueOnce(new Error('ClickHouse unavailable'));

    // Errors now propagate to tryFlush (which handles them by resyncing the
    // counter). processBuffer no longer swallows — we still verify the
    // safety property: the queue is preserved.
    await expect(sessionBuffer.processBuffer()).rejects.toThrow(
      'ClickHouse unavailable',
    );
    expect(await sessionBuffer.getBufferSize()).toBe(1);

    insertSpy.mockRestore();
  });
});
