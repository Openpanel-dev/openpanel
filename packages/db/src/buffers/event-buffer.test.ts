import { getRedisCache } from '@openpanel/redis';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
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
  await redis.flushall();
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

  it('keeps a single screen_view pending until a subsequent event arrives', async () => {
    const screenView = {
      project_id: 'p1',
      profile_id: 'u1',
      session_id: 'session_a',
      name: 'screen_view',
      created_at: new Date().toISOString(),
    } as any;

    await eventBuffer.add(screenView);

    // Not eligible for processing yet (only 1 event in session)
    await eventBuffer.processBuffer();

    const sessionKey = `event_buffer:session:${screenView.session_id}`;
    const events = await redis.lrange(sessionKey, 0, -1);
    expect(events.length).toBe(1);
    expect(JSON.parse(events[0]!)).toMatchObject({
      session_id: 'session_a',
      name: 'screen_view',
    });
  });

  it('processes two screen_view events and leaves only the last one pending', async () => {
    const t0 = Date.now();
    const first = {
      project_id: 'p1',
      profile_id: 'u1',
      session_id: 'session_b',
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any;
    const second = {
      project_id: 'p1',
      profile_id: 'u1',
      session_id: 'session_b',
      name: 'screen_view',
      created_at: new Date(t0 + 1000).toISOString(),
    } as any;

    await eventBuffer.add(first);
    await eventBuffer.add(second);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await eventBuffer.processBuffer();

    // First screen_view should be flushed to ClickHouse, second should remain pending in Redis
    expect(insertSpy).toHaveBeenCalledWith({
      format: 'JSONEachRow',
      table: 'events',
      values: [
        {
          ...first,
          duration: 1000,
        },
      ],
    });

    const sessionKey = `event_buffer:session:${first.session_id}`;
    const storedEvents = await redis.lrange(sessionKey, 0, -1);
    expect(storedEvents.length).toBe(1);
    const remaining = JSON.parse(storedEvents[0]!);
    expect(remaining).toMatchObject({
      session_id: 'session_b',
      name: 'screen_view',
      created_at: second.created_at,
    });
  });

  it('clears session when a session_end event arrives', async () => {
    const t0 = Date.now();
    const first = {
      project_id: 'p1',
      profile_id: 'u1',
      session_id: 'session_c',
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any;
    const end = {
      project_id: 'p1',
      profile_id: 'u1',
      session_id: 'session_c',
      name: 'session_end',
      created_at: new Date(t0 + 1000).toISOString(),
    } as any;

    await eventBuffer.add(first);
    await eventBuffer.add(end);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValue(undefined as any);

    await eventBuffer.processBuffer();

    // Both events should be flushed, leaving no pending session events
    expect(insertSpy).toHaveBeenCalledWith({
      format: 'JSONEachRow',
      table: 'events',
      values: [first, end],
    });
    const sessionKey = `event_buffer:session:${first.session_id}`;
    const storedEvents = await redis.lrange(sessionKey, 0, -1);
    expect(storedEvents.length).toBe(0);
  });

  it('queues and processes non-session events in regular queue', async () => {
    const event = {
      project_id: 'p2',
      name: 'custom_event',
      created_at: new Date().toISOString(),
    } as any;

    await eventBuffer.add(event);

    // Should be in regular queue
    const regularQueueKey = 'event_buffer:regular_queue';
    expect(await redis.llen(regularQueueKey)).toBe(1);

    // Buffer counter should reflect outstanding = 1
    expect(await eventBuffer.getBufferSize()).toBe(1);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);
    await eventBuffer.processBuffer();

    // Regular queue should be trimmed
    expect(await redis.llen(regularQueueKey)).toBe(0);
    expect(insertSpy).toHaveBeenCalled();

    // Buffer counter back to 0
    expect(await eventBuffer.getBufferSize()).toBe(0);
  });

  it('adds session to ready set at 2 events and removes after processing', async () => {
    const s = 'session_ready';
    const e1 = {
      project_id: 'p3',
      profile_id: 'u3',
      session_id: s,
      name: 'screen_view',
      created_at: new Date().toISOString(),
    } as any;
    const e2 = {
      ...e1,
      created_at: new Date(Date.now() + 1000).toISOString(),
    } as any;

    await eventBuffer.add(e1);

    // One event -> not ready
    expect(await redis.zscore('event_buffer:ready_sessions', s)).toBeNull();

    await eventBuffer.add(e2);

    // Two events -> ready
    expect(await redis.zscore('event_buffer:ready_sessions', s)).not.toBeNull();

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);
    await eventBuffer.processBuffer();

    // After processing with one pending left, session should be removed from ready set
    expect(await redis.zscore('event_buffer:ready_sessions', s)).toBeNull();
    expect(insertSpy).toHaveBeenCalled();
  });

  it('sets last screen_view key and clears it on session_end', async () => {
    const projectId = 'p4';
    const profileId = 'u4';
    const sessionId = 'session_last';
    const lastKey = `session:last_screen_view:${projectId}:${profileId}`;

    const view = {
      project_id: projectId,
      profile_id: profileId,
      session_id: sessionId,
      name: 'screen_view',
      created_at: new Date().toISOString(),
    } as any;

    await eventBuffer.add(view);

    // Should be set in Redis
    expect(await redis.get(lastKey)).not.toBeNull();

    const end = {
      project_id: projectId,
      profile_id: profileId,
      session_id: sessionId,
      name: 'session_end',
      created_at: new Date(Date.now() + 1000).toISOString(),
    } as any;

    await eventBuffer.add(end);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);
    await eventBuffer.processBuffer();

    // Key should be deleted by session_end
    expect(await redis.get(lastKey)).toBeNull();
    expect(insertSpy).toHaveBeenCalled();
  });

  it('getLastScreenView works for profile and session queries', async () => {
    const projectId = 'p5';
    const profileId = 'u5';
    const sessionId = 'session_glsv';

    const view = {
      project_id: projectId,
      profile_id: profileId,
      session_id: sessionId,
      name: 'screen_view',
      created_at: new Date().toISOString(),
    } as any;

    await eventBuffer.add(view);

    const byProfile = await eventBuffer.getLastScreenView({
      projectId,
      profileId,
    });

    if (!byProfile) {
      throw new Error('byProfile is null');
    }

    expect(byProfile.name).toBe('screen_view');

    const bySession = await eventBuffer.getLastScreenView({
      projectId,
      sessionId,
    });

    if (!bySession) {
      throw new Error('bySession is null');
    }

    expect(bySession.name).toBe('screen_view');
  });

  it('buffer counter reflects pending after processing 2 screen_view events', async () => {
    const sessionId = 'session_counter';
    const a = {
      project_id: 'p6',
      profile_id: 'u6',
      session_id: sessionId,
      name: 'screen_view',
      created_at: new Date().toISOString(),
    } as any;
    const b = {
      ...a,
      created_at: new Date(Date.now() + 1000).toISOString(),
    } as any;

    await eventBuffer.add(a);
    await eventBuffer.add(b);

    // Counter counts enqueued items
    expect(await eventBuffer.getBufferSize()).toBeGreaterThanOrEqual(2);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);
    await eventBuffer.processBuffer();

    // One pending screen_view left -> counter should be 1
    expect(await eventBuffer.getBufferSize()).toBe(1);
    expect(insertSpy).toHaveBeenCalled();
  });

  it('inserts in chunks according to EVENT_BUFFER_CHUNK_SIZE', async () => {
    const prev = process.env.EVENT_BUFFER_CHUNK_SIZE;
    process.env.EVENT_BUFFER_CHUNK_SIZE = '1';
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

    await eb.add(e1);
    await eb.add(e2);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValue(undefined as any);

    await eb.processBuffer();

    // With chunk size 1 and two events, insert should be called twice
    expect(insertSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Restore env
    if (prev === undefined) delete process.env.EVENT_BUFFER_CHUNK_SIZE;
    else process.env.EVENT_BUFFER_CHUNK_SIZE = prev;
  });

  it('counts active visitors after adding an event with profile', async () => {
    const e = {
      project_id: 'p7',
      profile_id: 'u7',
      name: 'custom',
      created_at: new Date().toISOString(),
    } as any;

    await eventBuffer.add(e);

    const count = await eventBuffer.getActiveVisitorCount('p7');
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('batches pending session updates (respects cap) during processBuffer', async () => {
    const prev = process.env.EVENT_BUFFER_UPDATE_PENDING_SESSIONS_BATCH_SIZE;
    process.env.EVENT_BUFFER_UPDATE_PENDING_SESSIONS_BATCH_SIZE = '3';
    const eb = new EventBuffer();

    // Create many sessions each with 2 screen_view events → leaves 1 pending per session
    const numSessions = 10;
    const base = Date.now();

    for (let i = 0; i < numSessions; i++) {
      const sid = `batch_s_${i}`;
      const e1 = {
        project_id: 'p8',
        profile_id: `u${i}`,
        session_id: sid,
        name: 'screen_view',
        created_at: new Date(base + i * 10).toISOString(),
      } as any;
      const e2 = {
        ...e1,
        created_at: new Date(base + i * 10 + 1).toISOString(),
      } as any;
      await eb.add(e1);
      await eb.add(e2);
    }

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValue(undefined as any);
    const evalSpy = vi.spyOn(redis as any, 'eval');

    await eb.processBuffer();

    // Only consider eval calls for batchUpdateSessionsScript (2 keys, second is total_count)
    const batchEvalCalls = evalSpy.mock.calls.filter(
      (call) => call[1] === 2 && call[3] === 'event_buffer:total_count',
    );

    const expectedCalls = Math.ceil(numSessions / 3);
    expect(batchEvalCalls.length).toBeGreaterThanOrEqual(expectedCalls);

    function countSessionsInEvalCall(args: any[]): number {
      let idx = 4; // ARGV starts after: script, numKeys, key1, key2
      let count = 0;
      while (idx < args.length) {
        if (idx + 3 >= args.length) break;
        const pendingCount = Number.parseInt(String(args[idx + 3]), 10);
        idx += 4 + Math.max(0, pendingCount);
        count += 1;
      }
      return count;
    }

    for (const call of batchEvalCalls) {
      expect(call[1]).toBe(2);
      expect(call[2]).toBe('event_buffer:ready_sessions');
      expect(call[3]).toBe('event_buffer:total_count');

      const sessionsInThisCall = countSessionsInEvalCall(call.slice(0));
      expect(sessionsInThisCall).toBeLessThanOrEqual(3);
      expect(sessionsInThisCall).toBeGreaterThan(0);
    }

    expect(insertSpy).toHaveBeenCalled();

    // Restore env
    if (prev === undefined)
      delete process.env.EVENT_BUFFER_UPDATE_PENDING_SESSIONS_BATCH_SIZE;
    else process.env.EVENT_BUFFER_UPDATE_PENDING_SESSIONS_BATCH_SIZE = prev;

    evalSpy.mockRestore();
    insertSpy.mockRestore();
  });
});
