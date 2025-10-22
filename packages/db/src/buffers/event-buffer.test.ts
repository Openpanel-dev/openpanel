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

    // Get initial count
    const initialCount = await eventBuffer.getBufferSize();

    // Add event
    await eventBuffer.add(event);

    // Buffer counter should increase by 1
    const newCount = await eventBuffer.getBufferSize();
    expect(newCount).toBe(initialCount + 1);
  });

  it('adds multiple screen_views - moves previous to buffer with duration', async () => {
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

    const view3 = {
      project_id: 'p1',
      profile_id: 'u1',
      session_id: sessionId,
      name: 'screen_view',
      created_at: new Date(t0 + 3000).toISOString(),
    } as any;

    // Add first screen_view
    const count1 = await eventBuffer.getBufferSize();
    await eventBuffer.add(view1);

    // Should be stored as "last" but NOT in queue yet
    const count2 = await eventBuffer.getBufferSize();
    expect(count2).toBe(count1); // No change in buffer

    // Last screen_view should be retrievable
    const last1 = await eventBuffer.getLastScreenView({
      projectId: 'p1',
      sessionId: sessionId,
    });
    expect(last1).not.toBeNull();
    expect(last1!.createdAt.toISOString()).toBe(view1.created_at);

    // Add second screen_view
    await eventBuffer.add(view2);

    // Now view1 should be in buffer
    const count3 = await eventBuffer.getBufferSize();
    expect(count3).toBe(count1 + 1);

    // view2 should now be the "last"
    const last2 = await eventBuffer.getLastScreenView({
      projectId: 'p1',
      sessionId: sessionId,
    });
    expect(last2!.createdAt.toISOString()).toBe(view2.created_at);

    // Add third screen_view
    await eventBuffer.add(view3);

    // Now view2 should also be in buffer
    const count4 = await eventBuffer.getBufferSize();
    expect(count4).toBe(count1 + 2);

    // view3 should now be the "last"
    const last3 = await eventBuffer.getLastScreenView({
      projectId: 'p1',
      sessionId: sessionId,
    });
    expect(last3!.createdAt.toISOString()).toBe(view3.created_at);
  });

  it('adds session_end - moves last screen_view and session_end to buffer', async () => {
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

    // Add screen_view
    const count1 = await eventBuffer.getBufferSize();
    await eventBuffer.add(view);

    // Should be stored as "last", not in buffer yet
    const count2 = await eventBuffer.getBufferSize();
    expect(count2).toBe(count1);

    // Add session_end
    await eventBuffer.add(sessionEnd);

    // Both should now be in buffer (+2)
    const count3 = await eventBuffer.getBufferSize();
    expect(count3).toBe(count1 + 2);

    // Last screen_view should be cleared
    const last = await eventBuffer.getLastScreenView({
      projectId: 'p2',
      sessionId: sessionId,
    });
    expect(last).toBeNull();
  });

  it('session_end with no previous screen_view - only adds session_end to buffer', async () => {
    const sessionId = 'session_3';

    const sessionEnd = {
      project_id: 'p3',
      profile_id: 'u3',
      session_id: sessionId,
      name: 'session_end',
      created_at: new Date().toISOString(),
    } as any;

    const count1 = await eventBuffer.getBufferSize();
    await eventBuffer.add(sessionEnd);

    // Only session_end should be in buffer (+1)
    const count2 = await eventBuffer.getBufferSize();
    expect(count2).toBe(count1 + 1);
  });

  it('gets last screen_view by profileId', async () => {
    const view = {
      project_id: 'p4',
      profile_id: 'u4',
      session_id: 'session_4',
      name: 'screen_view',
      path: '/home',
      created_at: new Date().toISOString(),
    } as any;

    await eventBuffer.add(view);

    // Query by profileId
    const result = await eventBuffer.getLastScreenView({
      projectId: 'p4',
      profileId: 'u4',
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('screen_view');
    expect(result!.path).toBe('/home');
  });

  it('gets last screen_view by sessionId', async () => {
    const sessionId = 'session_5';
    const view = {
      project_id: 'p5',
      profile_id: 'u5',
      session_id: sessionId,
      name: 'screen_view',
      path: '/about',
      created_at: new Date().toISOString(),
    } as any;

    await eventBuffer.add(view);

    // Query by sessionId
    const result = await eventBuffer.getLastScreenView({
      projectId: 'p5',
      sessionId: sessionId,
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('screen_view');
    expect(result!.path).toBe('/about');
  });

  it('returns null for non-existent last screen_view', async () => {
    const result = await eventBuffer.getLastScreenView({
      projectId: 'p_nonexistent',
      profileId: 'u_nonexistent',
    });

    expect(result).toBeNull();
  });

  it('gets buffer count correctly', async () => {
    // Initially 0
    expect(await eventBuffer.getBufferSize()).toBe(0);

    // Add regular event
    await eventBuffer.add({
      project_id: 'p6',
      name: 'event1',
      created_at: new Date().toISOString(),
    } as any);

    expect(await eventBuffer.getBufferSize()).toBe(1);

    // Add another regular event
    await eventBuffer.add({
      project_id: 'p6',
      name: 'event2',
      created_at: new Date().toISOString(),
    } as any);

    expect(await eventBuffer.getBufferSize()).toBe(2);

    // Add screen_view (not counted until flushed)
    await eventBuffer.add({
      project_id: 'p6',
      profile_id: 'u6',
      session_id: 'session_6',
      name: 'screen_view',
      created_at: new Date().toISOString(),
    } as any);

    // Still 2 (screen_view is pending)
    expect(await eventBuffer.getBufferSize()).toBe(2);

    // Add another screen_view (first one gets flushed)
    await eventBuffer.add({
      project_id: 'p6',
      profile_id: 'u6',
      session_id: 'session_6',
      name: 'screen_view',
      created_at: new Date(Date.now() + 1000).toISOString(),
    } as any);

    // Now 3 (2 regular + 1 flushed screen_view)
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

    await eventBuffer.add(event1);
    await eventBuffer.add(event2);

    expect(await eventBuffer.getBufferSize()).toBe(2);

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await eventBuffer.processBuffer();

    // Should insert both events
    expect(insertSpy).toHaveBeenCalled();
    const callArgs = insertSpy.mock.calls[0]![0];
    expect(callArgs.format).toBe('JSONEachRow');
    expect(callArgs.table).toBe('events');
    expect(Array.isArray(callArgs.values)).toBe(true);

    // Buffer should be empty after processing
    expect(await eventBuffer.getBufferSize()).toBe(0);

    insertSpy.mockRestore();
  });

  it('processes buffer with chunking', async () => {
    const prev = process.env.EVENT_BUFFER_CHUNK_SIZE;
    process.env.EVENT_BUFFER_CHUNK_SIZE = '2';
    const eb = new EventBuffer();

    // Add 4 events
    for (let i = 0; i < 4; i++) {
      await eb.add({
        project_id: 'p8',
        name: `event${i}`,
        created_at: new Date(Date.now() + i).toISOString(),
      } as any);
    }

    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValue(undefined as any);

    await eb.processBuffer();

    // With chunk size 2 and 4 events, should be called twice
    expect(insertSpy).toHaveBeenCalledTimes(2);
    const call1Values = insertSpy.mock.calls[0]![0].values as any[];
    const call2Values = insertSpy.mock.calls[1]![0].values as any[];
    expect(call1Values.length).toBe(2);
    expect(call2Values.length).toBe(2);

    // Restore
    if (prev === undefined) delete process.env.EVENT_BUFFER_CHUNK_SIZE;
    else process.env.EVENT_BUFFER_CHUNK_SIZE = prev;

    insertSpy.mockRestore();
  });

  it('tracks active visitors', async () => {
    const event = {
      project_id: 'p9',
      profile_id: 'u9',
      name: 'custom',
      created_at: new Date().toISOString(),
    } as any;

    await eventBuffer.add(event);

    const count = await eventBuffer.getActiveVisitorCount('p9');
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('handles multiple sessions independently', async () => {
    const t0 = Date.now();

    // Session 1
    const view1a = {
      project_id: 'p10',
      profile_id: 'u10',
      session_id: 'session_10a',
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any;

    const view1b = {
      project_id: 'p10',
      profile_id: 'u10',
      session_id: 'session_10a',
      name: 'screen_view',
      created_at: new Date(t0 + 1000).toISOString(),
    } as any;

    // Session 2
    const view2a = {
      project_id: 'p10',
      profile_id: 'u11',
      session_id: 'session_10b',
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any;

    const view2b = {
      project_id: 'p10',
      profile_id: 'u11',
      session_id: 'session_10b',
      name: 'screen_view',
      created_at: new Date(t0 + 2000).toISOString(),
    } as any;

    await eventBuffer.add(view1a);
    await eventBuffer.add(view2a);
    await eventBuffer.add(view1b); // Flushes view1a
    await eventBuffer.add(view2b); // Flushes view2a

    // Should have 2 events in buffer (one from each session)
    expect(await eventBuffer.getBufferSize()).toBe(2);

    // Each session should have its own "last" screen_view
    const last1 = await eventBuffer.getLastScreenView({
      projectId: 'p10',
      sessionId: 'session_10a',
    });
    expect(last1!.createdAt.toISOString()).toBe(view1b.created_at);

    const last2 = await eventBuffer.getLastScreenView({
      projectId: 'p10',
      sessionId: 'session_10b',
    });
    expect(last2!.createdAt.toISOString()).toBe(view2b.created_at);
  });

  it('screen_view without session_id goes directly to buffer', async () => {
    const view = {
      project_id: 'p11',
      profile_id: 'u11',
      name: 'screen_view',
      created_at: new Date().toISOString(),
    } as any;

    const count1 = await eventBuffer.getBufferSize();
    await eventBuffer.add(view);

    // Should go directly to buffer (no session_id)
    const count2 = await eventBuffer.getBufferSize();
    expect(count2).toBe(count1 + 1);
  });

  it('updates last screen_view when new one arrives from same profile but different session', async () => {
    const t0 = Date.now();

    const view1 = {
      project_id: 'p12',
      profile_id: 'u12',
      session_id: 'session_12a',
      name: 'screen_view',
      path: '/page1',
      created_at: new Date(t0).toISOString(),
    } as any;

    const view2 = {
      project_id: 'p12',
      profile_id: 'u12',
      session_id: 'session_12b', // Different session!
      name: 'screen_view',
      path: '/page2',
      created_at: new Date(t0 + 1000).toISOString(),
    } as any;

    await eventBuffer.add(view1);
    await eventBuffer.add(view2);

    // Both sessions should have their own "last"
    const lastSession1 = await eventBuffer.getLastScreenView({
      projectId: 'p12',
      sessionId: 'session_12a',
    });
    expect(lastSession1!.path).toBe('/page1');

    const lastSession2 = await eventBuffer.getLastScreenView({
      projectId: 'p12',
      sessionId: 'session_12b',
    });
    expect(lastSession2!.path).toBe('/page2');

    // Profile should have the latest one
    const lastProfile = await eventBuffer.getLastScreenView({
      projectId: 'p12',
      profileId: 'u12',
    });
    expect(lastProfile!.path).toBe('/page2');
  });
});
