import { getRedisCache } from '@openpanel/redis';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as chClient from '../clickhouse/client';
const { ch } = chClient;

// Break circular dep: event-buffer -> event.service -> buffers/index -> EventBuffer
vi.mock('../services/event.service', () => ({}));

import { EventBuffer } from './event-buffer';

const redis = getRedisCache();

beforeEach(async () => {
  const keys = await redis.keys('event*');
  if (keys.length > 0) await redis.del(...keys);
});

afterAll(async () => {
  try {
    await redis.quit();
  } catch {}
});

describe('EventBuffer', () => {
  let eventBuffer: EventBuffer;

  beforeEach(() => {
    eventBuffer = new EventBuffer();
  });

  it('adds regular event directly to buffer queue', async () => {
    const event = {
      project_id: 'p1',
      profile_id: 'u1',
      name: 'custom_event',
      created_at: new Date().toISOString(),
    } as any;

    const initialCount = await eventBuffer.getBufferSize();

    eventBuffer.add(event);
    await eventBuffer.flush();

    const newCount = await eventBuffer.getBufferSize();
    expect(newCount).toBe(initialCount + 1);
  });

  it('adds screen_view directly to buffer queue', async () => {
    const t0 = Date.now();
    const sessionId = 'session_1';

    const view1 = {
      project_id: 'p1',
      profile_id: 'u1',
      session_id: sessionId,
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any;

    const view2 = {
      project_id: 'p1',
      profile_id: 'u1',
      session_id: sessionId,
      name: 'screen_view',
      created_at: new Date(t0 + 1000).toISOString(),
    } as any;

    const count1 = await eventBuffer.getBufferSize();

    eventBuffer.add(view1);
    await eventBuffer.flush();

    // screen_view goes directly to buffer
    const count2 = await eventBuffer.getBufferSize();
    expect(count2).toBe(count1 + 1);

    eventBuffer.add(view2);
    await eventBuffer.flush();

    const count3 = await eventBuffer.getBufferSize();
    expect(count3).toBe(count1 + 2);
  });

  it('adds session_end directly to buffer queue', async () => {
    const t0 = Date.now();
    const sessionId = 'session_2';

    const view = {
      project_id: 'p2',
      profile_id: 'u2',
      session_id: sessionId,
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any;

    const sessionEnd = {
      project_id: 'p2',
      profile_id: 'u2',
      session_id: sessionId,
      name: 'session_end',
      created_at: new Date(t0 + 5000).toISOString(),
    } as any;

    const count1 = await eventBuffer.getBufferSize();

    eventBuffer.add(view);
    eventBuffer.add(sessionEnd);
    await eventBuffer.flush();

    const count2 = await eventBuffer.getBufferSize();
    expect(count2).toBe(count1 + 2);
  });

  it('gets buffer count correctly', async () => {
    expect(await eventBuffer.getBufferSize()).toBe(0);

    eventBuffer.add({
      project_id: 'p6',
      name: 'event1',
      created_at: new Date().toISOString(),
    } as any);
    await eventBuffer.flush();
    expect(await eventBuffer.getBufferSize()).toBe(1);

    eventBuffer.add({
      project_id: 'p6',
      name: 'event2',
      created_at: new Date().toISOString(),
    } as any);
    await eventBuffer.flush();
    expect(await eventBuffer.getBufferSize()).toBe(2);

    // screen_view also goes directly to buffer
    eventBuffer.add({
      project_id: 'p6',
      profile_id: 'u6',
      session_id: 'session_6',
      name: 'screen_view',
      created_at: new Date().toISOString(),
    } as any);
    await eventBuffer.flush();
    expect(await eventBuffer.getBufferSize()).toBe(3);
  });

  it('processes buffer and inserts events into ClickHouse', async () => {
    const event1 = {
      project_id: 'p7',
      name: 'event1',
      created_at: new Date(Date.now()).toISOString(),
    } as any;

    const event2 = {
      project_id: 'p7',
      name: 'event2',
      created_at: new Date(Date.now() + 1000).toISOString(),
    } as any;

    eventBuffer.add(event1);
    eventBuffer.add(event2);
    await eventBuffer.flush();

    expect(await eventBuffer.getBufferSize()).toBe(2);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await eventBuffer.processBuffer();

    expect(insertSpy).toHaveBeenCalled();
    const callArgs = insertSpy.mock.calls[0]![0];
    expect(callArgs.format).toBe('JSONEachRow');
    expect(callArgs.table).toBe('events');
    expect(Array.isArray(callArgs.values)).toBe(true);

    expect(await eventBuffer.getBufferSize()).toBe(0);

    insertSpy.mockRestore();
  });

  it('processes buffer with chunking', async () => {
    const prev = process.env.EVENT_BUFFER_CHUNK_SIZE;
    process.env.EVENT_BUFFER_CHUNK_SIZE = '2';
    const eb = new EventBuffer();

    for (let i = 0; i < 4; i++) {
      eb.add({
        project_id: 'p8',
        name: `event${i}`,
        created_at: new Date(Date.now() + i).toISOString(),
      } as any);
    }
    await eb.flush();

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValue(undefined as any);

    await eb.processBuffer();

    expect(insertSpy).toHaveBeenCalledTimes(2);
    const call1Values = insertSpy.mock.calls[0]![0].values as any[];
    const call2Values = insertSpy.mock.calls[1]![0].values as any[];
    expect(call1Values.length).toBe(2);
    expect(call2Values.length).toBe(2);

    if (prev === undefined) delete process.env.EVENT_BUFFER_CHUNK_SIZE;
    else process.env.EVENT_BUFFER_CHUNK_SIZE = prev;

    insertSpy.mockRestore();
  });

  it('tracks active visitors', async () => {
    const querySpy = vi
      .spyOn(chClient, 'chQuery')
      .mockResolvedValueOnce([{ count: 2 }] as any);

    const count = await eventBuffer.getActiveVisitorCount('p9');
    expect(count).toBe(2);
    expect(querySpy).toHaveBeenCalledOnce();
    expect(querySpy.mock.calls[0]![0]).toContain("project_id = 'p9'");

    querySpy.mockRestore();
  });

  it('handles multiple sessions independently — all events go to buffer', async () => {
    const t0 = Date.now();
    const count1 = await eventBuffer.getBufferSize();

    eventBuffer.add({
      project_id: 'p10',
      profile_id: 'u10',
      session_id: 'session_10a',
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any);
    eventBuffer.add({
      project_id: 'p10',
      profile_id: 'u11',
      session_id: 'session_10b',
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any);
    eventBuffer.add({
      project_id: 'p10',
      profile_id: 'u10',
      session_id: 'session_10a',
      name: 'screen_view',
      created_at: new Date(t0 + 1000).toISOString(),
    } as any);
    eventBuffer.add({
      project_id: 'p10',
      profile_id: 'u11',
      session_id: 'session_10b',
      name: 'screen_view',
      created_at: new Date(t0 + 2000).toISOString(),
    } as any);
    await eventBuffer.flush();

    // All 4 events are in buffer directly
    expect(await eventBuffer.getBufferSize()).toBe(count1 + 4);
  });

  it('bulk adds events to buffer', async () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      project_id: 'p11',
      name: `event${i}`,
      created_at: new Date(Date.now() + i).toISOString(),
    })) as any[];

    eventBuffer.bulkAdd(events);
    await eventBuffer.flush();

    expect(await eventBuffer.getBufferSize()).toBe(5);
  });

  it('retains events in queue when ClickHouse insert fails', async () => {
    eventBuffer.add({
      project_id: 'p12',
      name: 'event1',
      created_at: new Date().toISOString(),
    } as any);
    await eventBuffer.flush();

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockRejectedValueOnce(new Error('ClickHouse unavailable'));

    await eventBuffer.processBuffer();

    // Events must still be in the queue — not lost
    expect(await eventBuffer.getBufferSize()).toBe(1);

    insertSpy.mockRestore();
  });
});
