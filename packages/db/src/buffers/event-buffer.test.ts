import { getRedisCache } from '@openpanel/redis';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ch } from '../clickhouse/client';

// Mock transformEvent to avoid circular dependency with buffers -> services -> buffers
vi.mock('../services/event.service', () => ({
  transformEvent: (event: any) => ({
    id: event.id ?? 'id',
    name: event.name,
    deviceId: event.device_id,
    profileId: event.profile_id,
    projectId: event.project_id,
    sessionId: event.session_id,
    properties: event.properties ?? {},
    createdAt: new Date(event.created_at ?? Date.now()),
    country: event.country,
    city: event.city,
    region: event.region,
    longitude: event.longitude,
    latitude: event.latitude,
    os: event.os,
    osVersion: event.os_version,
    browser: event.browser,
    browserVersion: event.browser_version,
    device: event.device,
    brand: event.brand,
    model: event.model,
    duration: event.duration ?? 0,
    path: event.path ?? '',
    origin: event.origin ?? '',
    referrer: event.referrer,
    referrerName: event.referrer_name,
    referrerType: event.referrer_type,
    meta: event.meta,
    importedAt: undefined,
    sdkName: event.sdk_name,
    sdkVersion: event.sdk_version,
    profile: event.profile,
  }),
}));

import { EventBuffer } from './event-buffer';

const redis = getRedisCache();

beforeEach(async () => {
  await redis.flushdb();
});

afterAll(async () => {
  try {
    await redis.quit();
  } catch {}
});

describe('EventBuffer with real Redis', () => {
  let eventBuffer: EventBuffer;

  beforeEach(() => {
    eventBuffer = new EventBuffer();
  });

  it('adds events to buffer', async () => {
    const event = {
      project_id: 'p1',
      profile_id: 'u1',
      session_id: 'session_a',
      name: 'screen_view',
      created_at: new Date().toISOString(),
    } as any;

    await eventBuffer.add(event);

    const bufferKey = 'event-buffer';
    const events = await redis.lrange(bufferKey, 0, -1);
    expect(events.length).toBe(1);
    expect(JSON.parse(events[0]!)).toMatchObject({
      session_id: 'session_a',
      name: 'screen_view',
    });
  });

  it('processes events from buffer and inserts into ClickHouse', async () => {
    const event1 = {
      project_id: 'p1',
      name: 'event1',
      created_at: new Date().toISOString(),
    } as any;
    const event2 = {
      project_id: 'p1',
      name: 'event2',
      created_at: new Date(Date.now() + 1000).toISOString(),
    } as any;

    await eventBuffer.add(event1);
    await eventBuffer.add(event2);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await eventBuffer.processBuffer();

    // Both events should be flushed to ClickHouse
    expect(insertSpy).toHaveBeenCalled();
    const insertCall = insertSpy.mock.calls[0]![0] as any;
    expect(insertCall.format).toBe('JSONEachRow');
    expect(insertCall.table).toBe('events');
    expect(insertCall.values).toHaveLength(2);
    expect(insertCall.values?.[0]).toMatchObject({ name: 'event1' });
    expect(insertCall.values?.[1]).toMatchObject({ name: 'event2' });

    // Buffer should be empty after processing
    const bufferKey = 'event-buffer';
    const storedEvents = await redis.lrange(bufferKey, 0, -1);
    expect(storedEvents.length).toBe(0);

    insertSpy.mockRestore();
  });

  it('sorts events by creation time before inserting', async () => {
    const event1 = {
      project_id: 'p1',
      name: 'event1',
      created_at: new Date(Date.now() + 2000).toISOString(),
    } as any;
    const event2 = {
      project_id: 'p1',
      name: 'event2',
      created_at: new Date(Date.now() + 1000).toISOString(),
    } as any;
    const event3 = {
      project_id: 'p1',
      name: 'event3',
      created_at: new Date().toISOString(),
    } as any;

    await eventBuffer.add(event1);
    await eventBuffer.add(event2);
    await eventBuffer.add(event3);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await eventBuffer.processBuffer();

    // Events should be sorted by created_at
    expect(insertSpy).toHaveBeenCalled();
    const insertCall = insertSpy.mock.calls[0]![0] as any;
    expect(insertCall.format).toBe('JSONEachRow');
    expect(insertCall.table).toBe('events');
    expect(insertCall.values).toHaveLength(3);
    expect(insertCall.values[0]).toMatchObject({ name: 'event3' });
    expect(insertCall.values[1]).toMatchObject({ name: 'event2' });
    expect(insertCall.values[2]).toMatchObject({ name: 'event1' });

    insertSpy.mockRestore();
  });

  it('handles empty buffer gracefully', async () => {
    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await eventBuffer.processBuffer();

    // Should not insert anything
    expect(insertSpy).not.toHaveBeenCalled();

    insertSpy.mockRestore();
  });

  it('respects EVENT_BUFFER_BATCH_SIZE', async () => {
    const prev = process.env.EVENT_BUFFER_BATCH_SIZE;
    process.env.EVENT_BUFFER_BATCH_SIZE = '2';
    const eb = new EventBuffer();

    const events = Array.from({ length: 5 }, (_, i) => ({
      project_id: 'p1',
      name: `event${i}`,
      created_at: new Date(Date.now() + i * 100).toISOString(),
    }));

    for (const event of events) {
      await eb.add(event as any);
    }

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValue(undefined as any);

    await eb.processBuffer();

    // Only first 2 events should be processed (batchSize = 2)
    expect(insertSpy).toHaveBeenCalledOnce();
    const insertCall = insertSpy.mock.calls[0]![0] as any;
    expect(insertCall.format).toBe('JSONEachRow');
    expect(insertCall.table).toBe('events');
    expect(insertCall.values).toHaveLength(2);
    expect(insertCall.values[0]).toMatchObject({ name: 'event0' });
    expect(insertCall.values[1]).toMatchObject({ name: 'event1' });

    // 3 events should remain in buffer
    const bufferKey = 'event-buffer';
    const remaining = await redis.lrange(bufferKey, 0, -1);
    expect(remaining.length).toBe(3);

    // Restore env
    if (prev === undefined) delete process.env.EVENT_BUFFER_BATCH_SIZE;
    else process.env.EVENT_BUFFER_BATCH_SIZE = prev;

    insertSpy.mockRestore();
  });

  it('inserts in chunks according to EVENT_BUFFER_CHUNK_SIZE', async () => {
    const prev = process.env.EVENT_BUFFER_CHUNK_SIZE;
    const prevBatch = process.env.EVENT_BUFFER_BATCH_SIZE;
    process.env.EVENT_BUFFER_CHUNK_SIZE = '1';
    process.env.EVENT_BUFFER_BATCH_SIZE = '10'; // High enough to not trigger auto-flush
    const eb = new EventBuffer();

    const e1 = {
      project_id: 'pc',
      name: 'ev1',
      created_at: new Date().toISOString(),
    } as any;
    const e2 = {
      project_id: 'pc',
      name: 'ev2',
      created_at: new Date(Date.now() + 1).toISOString(),
    } as any;

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValue(undefined as any);

    await eb.add(e1);
    await eb.add(e2);

    await eb.processBuffer();

    // With chunk size 1 and two events, insert should be called twice
    expect(insertSpy).toHaveBeenCalledTimes(2);

    // Restore env
    if (prev === undefined) delete process.env.EVENT_BUFFER_CHUNK_SIZE;
    else process.env.EVENT_BUFFER_CHUNK_SIZE = prev;
    if (prevBatch === undefined) delete process.env.EVENT_BUFFER_BATCH_SIZE;
    else process.env.EVENT_BUFFER_BATCH_SIZE = prevBatch;

    insertSpy.mockRestore();
  });

  it('tracks active visitors after adding an event with profile', async () => {
    const event = {
      project_id: 'p7',
      profile_id: 'u7',
      name: 'custom',
      created_at: new Date().toISOString(),
    } as any;

    await eventBuffer.add(event);

    const count = await eventBuffer.getActiveVisitorCount('p7');
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('getBufferSize returns correct count', async () => {
    const prev = process.env.EVENT_BUFFER_BATCH_SIZE;
    process.env.EVENT_BUFFER_BATCH_SIZE = '1000'; // High enough to prevent auto-flush
    const eb = new EventBuffer();

    const event1 = {
      project_id: 'p1',
      name: 'event1',
      created_at: new Date().toISOString(),
    } as any;
    const event2 = {
      project_id: 'p1',
      name: 'event2',
      created_at: new Date().toISOString(),
    } as any;

    expect(await eb.getBufferSize()).toBe(0);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValue(undefined as any);

    await eb.add(event1);
    expect(await eb.getBufferSize()).toBe(1);

    await eb.add(event2);
    expect(await eb.getBufferSize()).toBe(2);

    await eb.processBuffer();

    expect(await eb.getBufferSize()).toBe(0);

    // Restore env
    if (prev === undefined) delete process.env.EVENT_BUFFER_BATCH_SIZE;
    else process.env.EVENT_BUFFER_BATCH_SIZE = prev;

    insertSpy.mockRestore();
  });

  it('bulkAdd adds multiple events atomically', async () => {
    const events = Array.from({ length: 3 }, (_, i) => ({
      project_id: 'p1',
      name: `event${i}`,
      created_at: new Date(Date.now() + i * 100).toISOString(),
    })) as any[];

    await eventBuffer.bulkAdd(events);

    const bufferKey = 'event-buffer';
    const storedEvents = await redis.lrange(bufferKey, 0, -1);
    expect(storedEvents.length).toBe(3);
  });

  it('handles events with all fields correctly', async () => {
    const event = {
      project_id: 'p1',
      profile_id: 'u1',
      session_id: 's1',
      device_id: 'd1',
      name: 'screen_view',
      path: '/home',
      origin: 'https://example.com',
      duration: 5000,
      properties: { key: 'value' },
      created_at: new Date().toISOString(),
      country: 'US',
      city: 'NYC',
      region: 'NY',
      os: 'macOS',
      browser: 'Chrome',
    } as any;

    await eventBuffer.add(event);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await eventBuffer.processBuffer();

    expect(insertSpy).toHaveBeenCalled();
    const insertCall = insertSpy.mock.calls[0]![0] as any;
    expect(insertCall.format).toBe('JSONEachRow');
    expect(insertCall.table).toBe('events');
    expect(insertCall.values).toHaveLength(1);
    expect(insertCall.values[0]).toMatchObject({
      project_id: 'p1',
      profile_id: 'u1',
      session_id: 's1',
      name: 'screen_view',
      path: '/home',
    });

    insertSpy.mockRestore();
  });
});
