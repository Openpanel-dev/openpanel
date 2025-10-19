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

const clickhouseSettings = {
  async_insert: 1,
  http_headers_progress_interval_ms: '50000',
  input_format_parallel_parsing: 1,
  max_execution_time: 300,
  max_http_get_redirects: '0',
  max_insert_block_size: '500000',
  send_progress_in_http_headers: 1,
  wait_end_of_query: 1,
  wait_for_async_insert: 1,
};

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
      clickhouse_settings: clickhouseSettings,
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
      clickhouse_settings: clickhouseSettings,
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

  it('adds session to ready set at 2 events and removes it when < 2 events remain', async () => {
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

    // After processing with one pending left, session should be REMOVED from ready set
    // It will be re-added when the next event arrives
    expect(await redis.zscore('event_buffer:ready_sessions', s)).toBeNull();
    expect(insertSpy).toHaveBeenCalled();

    // But the session and its data should still exist
    const sessionKey = `event_buffer:session:${s}`;
    const remaining = await redis.lrange(sessionKey, 0, -1);
    expect(remaining.length).toBe(1); // One pending event
    expect(
      await redis.zscore('event_buffer:sessions_sorted', s),
    ).not.toBeNull(); // Still in sorted set
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

    // Only consider eval calls for batchUpdateSessionsScript (3 keys now: ready, sorted, counter)
    const batchEvalCalls = evalSpy.mock.calls.filter(
      (call) => call[1] === 3 && call[4] === 'event_buffer:total_count',
    );

    const expectedCalls = Math.ceil(numSessions / 3);
    expect(batchEvalCalls.length).toBeGreaterThanOrEqual(expectedCalls);

    function countSessionsInEvalCall(args: any[]): number {
      let idx = 5; // ARGV starts after: script, numKeys, key1, key2, key3
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
      expect(call[1]).toBe(3);
      expect(call[2]).toBe('event_buffer:ready_sessions');
      expect(call[3]).toBe('event_buffer:sessions_sorted');
      expect(call[4]).toBe('event_buffer:total_count');

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

  it('flushes a lone session_end and clears the session list', async () => {
    const s = 'session_only_end';
    const end = {
      project_id: 'p9',
      profile_id: 'u9',
      session_id: s,
      name: 'session_end',
      created_at: new Date().toISOString(),
    } as any;

    const eb = new EventBuffer();
    await eb.add(end);

    // Should be considered ready even though only 1 event (session_end)
    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await eb.processBuffer();

    expect(insertSpy).toHaveBeenCalledWith({
      format: 'JSONEachRow',
      table: 'events',
      values: [end],
      clickhouse_settings: clickhouseSettings,
    });

    const sessionKey = `event_buffer:session:${s}`;
    const remaining = await redis.lrange(sessionKey, 0, -1);
    expect(remaining.length).toBe(0);

    insertSpy.mockRestore();
  });

  it('flushes ALL screen_views when session_end arrives (no pending events)', async () => {
    const t0 = Date.now();
    const s = 'session_multi_end';
    const view1 = {
      project_id: 'p10',
      profile_id: 'u10',
      session_id: s,
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any;
    const view2 = {
      ...view1,
      created_at: new Date(t0 + 1000).toISOString(),
    } as any;
    const view3 = {
      ...view1,
      created_at: new Date(t0 + 2000).toISOString(),
    } as any;
    const end = {
      ...view1,
      name: 'session_end',
      created_at: new Date(t0 + 3000).toISOString(),
    } as any;

    const eb = new EventBuffer();
    await eb.add(view1);
    await eb.add(view2);
    await eb.add(view3);
    await eb.add(end);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await eb.processBuffer();

    // All 4 events should be flushed (3 screen_views + session_end)
    expect(insertSpy).toHaveBeenCalledWith({
      format: 'JSONEachRow',
      table: 'events',
      values: [view1, view2, view3, end],
      clickhouse_settings: clickhouseSettings,
    });

    // Session should be completely empty and removed
    const sessionKey = `event_buffer:session:${s}`;
    const remaining = await redis.lrange(sessionKey, 0, -1);
    expect(remaining.length).toBe(0);

    // Session should be removed from both sorted sets
    expect(await redis.zscore('event_buffer:sessions_sorted', s)).toBeNull();
    expect(await redis.zscore('event_buffer:ready_sessions', s)).toBeNull();

    insertSpy.mockRestore();
  });

  it('re-adds session to ready_sessions when new event arrives after processing', async () => {
    const t0 = Date.now();
    const s = 'session_continued';
    const view1 = {
      project_id: 'p11',
      profile_id: 'u11',
      session_id: s,
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any;
    const view2 = {
      ...view1,
      created_at: new Date(t0 + 1000).toISOString(),
    } as any;

    const eb = new EventBuffer();
    await eb.add(view1);
    await eb.add(view2);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValue(undefined as any);

    // First processing: flush view1, keep view2 pending
    await eb.processBuffer();

    expect(insertSpy).toHaveBeenCalledWith({
      format: 'JSONEachRow',
      table: 'events',
      values: [{ ...view1, duration: 1000 }],
      clickhouse_settings: clickhouseSettings,
    });

    // Session should be REMOVED from ready_sessions (only 1 event left)
    expect(await redis.zscore('event_buffer:ready_sessions', s)).toBeNull();

    // Add a third screen_view - this should re-add to ready_sessions
    const view3 = {
      ...view1,
      created_at: new Date(t0 + 2000).toISOString(),
    } as any;
    await eb.add(view3);

    // NOW it should be back in ready_sessions (2 events again)
    expect(await redis.zscore('event_buffer:ready_sessions', s)).not.toBeNull();

    insertSpy.mockClear();

    // Second processing: should process view2 (now has duration), keep view3 pending
    await eb.processBuffer();

    expect(insertSpy).toHaveBeenCalledWith({
      format: 'JSONEachRow',
      table: 'events',
      values: [{ ...view2, duration: 1000 }],
      clickhouse_settings: clickhouseSettings,
    });

    // Session should be REMOVED again (only 1 event left)
    expect(await redis.zscore('event_buffer:ready_sessions', s)).toBeNull();

    const sessionKey = `event_buffer:session:${s}`;
    const remaining = await redis.lrange(sessionKey, 0, -1);
    expect(remaining.length).toBe(1);
    expect(JSON.parse(remaining[0]!)).toMatchObject({
      session_id: s,
      created_at: view3.created_at,
    });

    insertSpy.mockRestore();
  });

  it('removes session from ready_sessions only when completely empty', async () => {
    const t0 = Date.now();
    const s = 'session_complete';
    const view = {
      project_id: 'p12',
      profile_id: 'u12',
      session_id: s,
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any;
    const end = {
      ...view,
      name: 'session_end',
      created_at: new Date(t0 + 1000).toISOString(),
    } as any;

    const eb = new EventBuffer();
    await eb.add(view);
    await eb.add(end);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await eb.processBuffer();

    // Both events flushed, session empty
    expect(insertSpy).toHaveBeenCalledWith({
      format: 'JSONEachRow',
      table: 'events',
      values: [view, end],
      clickhouse_settings: clickhouseSettings,
    });

    // NOW it should be removed from ready_sessions (because it's empty)
    expect(await redis.zscore('event_buffer:ready_sessions', s)).toBeNull();
    expect(await redis.zscore('event_buffer:sessions_sorted', s)).toBeNull();

    insertSpy.mockRestore();
  });

  it('getBufferSizeHeavy correctly counts events across many sessions in batches', async () => {
    const eb = new EventBuffer();
    const numSessions = 250; // More than batch size (100) to test batching
    const eventsPerSession = 3;
    const numRegularEvents = 50;

    // Add session events (3 events per session)
    for (let i = 0; i < numSessions; i++) {
      const sessionId = `batch_session_${i}`;
      for (let j = 0; j < eventsPerSession; j++) {
        await eb.add({
          project_id: 'p_batch',
          profile_id: `u_${i}`,
          session_id: sessionId,
          name: 'screen_view',
          created_at: new Date(Date.now() + i * 100 + j * 10).toISOString(),
        } as any);
      }
    }

    // Add regular queue events
    for (let i = 0; i < numRegularEvents; i++) {
      await eb.add({
        project_id: 'p_batch',
        name: 'custom_event',
        created_at: new Date().toISOString(),
      } as any);
    }

    // Get buffer size using heavy method
    const bufferSize = await eb.getBufferSizeHeavy();

    // Should count all events: (250 sessions × 3 events) + 50 regular events
    const expectedSize = numSessions * eventsPerSession + numRegularEvents;
    expect(bufferSize).toBe(expectedSize);

    // Verify sessions are properly tracked
    const sessionCount = await redis.zcard('event_buffer:sessions_sorted');
    expect(sessionCount).toBe(numSessions);

    const regularQueueCount = await redis.llen('event_buffer:regular_queue');
    expect(regularQueueCount).toBe(numRegularEvents);
  });

  it('getBufferSizeHeavy handles empty buffer correctly', async () => {
    const eb = new EventBuffer();

    const bufferSize = await eb.getBufferSizeHeavy();

    expect(bufferSize).toBe(0);
  });

  it('getBufferSizeHeavy handles only regular queue events', async () => {
    const eb = new EventBuffer();
    const numEvents = 10;

    for (let i = 0; i < numEvents; i++) {
      await eb.add({
        project_id: 'p_regular',
        name: 'custom_event',
        created_at: new Date().toISOString(),
      } as any);
    }

    const bufferSize = await eb.getBufferSizeHeavy();

    expect(bufferSize).toBe(numEvents);
  });

  it('getBufferSizeHeavy handles only session events', async () => {
    const eb = new EventBuffer();
    const numSessions = 5;
    const eventsPerSession = 2;

    for (let i = 0; i < numSessions; i++) {
      for (let j = 0; j < eventsPerSession; j++) {
        await eb.add({
          project_id: 'p_sessions',
          profile_id: `u_${i}`,
          session_id: `session_${i}`,
          name: 'screen_view',
          created_at: new Date(Date.now() + i * 100 + j * 10).toISOString(),
        } as any);
      }
    }

    const bufferSize = await eb.getBufferSizeHeavy();

    expect(bufferSize).toBe(numSessions * eventsPerSession);
  });
});
