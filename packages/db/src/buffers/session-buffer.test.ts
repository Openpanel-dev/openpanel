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

  it('retains sessions in queue when ClickHouse insert fails', async () => {
    await sessionBuffer.add(makeEvent({}));

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockRejectedValueOnce(new Error('ClickHouse unavailable'));

    await sessionBuffer.processBuffer();

    // Sessions must still be in the queue — not lost
    expect(await sessionBuffer.getBufferSize()).toBe(1);

    insertSpy.mockRestore();
  });
});
