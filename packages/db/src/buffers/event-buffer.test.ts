import type { Readable } from 'node:stream';
import { getRedisCache } from '@openpanel/redis';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as chClient from '../clickhouse/client';
const { ch } = chClient;

// Break circular dep: event-buffer -> event.service -> buffers/index -> EventBuffer
vi.mock('../services/event.service', () => ({}));

import { EventBuffer, extractProjectId } from './event-buffer';

/** Drain an object-mode Readable into an array of line strings. event-buffer
 *  yields each JSONEachRow row as its own string chunk; the @clickhouse/client
 *  adds the trailing '\n' itself via encodeJSON. So in production each `\n` is
 *  added by the client, but here we just collect chunks 1:1. */
async function streamToLines(stream: Readable): Promise<string[]> {
  const lines: string[] = [];
  for await (const chunk of stream) {
    lines.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  }
  return lines;
}

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
    // After the raw-passthrough optimisation, `values` is an
    // object-mode Readable stream that yields pre-serialized
    // JSONEachRow lines as strings. The client (configured with
    // `json.stringify: (v) => typeof v === 'string' ? v : JSON.stringify(v)`)
    // then passes the strings through unchanged — no JSON.parse on
    // our side, no JSON.stringify on the client's side. Object mode
    // is mandatory: @clickhouse/client rejects byte streams for
    // JSON* formats with "expected Readable Stream with enabled
    // object mode".
    const stream = callArgs.values as Readable;
    expect(stream.readableObjectMode).toBe(true);
    const lines = await streamToLines(stream);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]!).name).toBe('event1');
    expect(JSON.parse(lines[1]!).name).toBe('event2');

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
    const call1 = await streamToLines(
      insertSpy.mock.calls[0]![0].values as Readable,
    );
    const call2 = await streamToLines(
      insertSpy.mock.calls[1]![0].values as Readable,
    );
    expect(call1.length).toBe(2);
    expect(call2.length).toBe(2);

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

    // Errors propagate to tryFlush (which resyncs the counter). The safety
    // property — queue preserved on CH failure — still holds.
    await expect(eventBuffer.processBuffer()).rejects.toThrow(
      'ClickHouse unavailable',
    );
    expect(await eventBuffer.getBufferSize()).toBe(1);

    insertSpy.mockRestore();
  });
});

describe('extractProjectId', () => {
  it('extracts the top-level project_id', () => {
    const line = JSON.stringify({
      id: 'evt1',
      name: 'foo',
      project_id: 'real-project',
    });
    expect(extractProjectId(line)).toBe('real-project');
  });

  it('returns null when the field is absent', () => {
    const line = JSON.stringify({ id: 'evt1', name: 'foo' });
    expect(extractProjectId(line)).toBeNull();
  });

  it('returns null on malformed input', () => {
    expect(extractProjectId('not json at all')).toBeNull();
    expect(extractProjectId('')).toBeNull();
  });

  it('returns null when project_id is empty', () => {
    // Empty string never matches `"project_id":"..."` — the value side
    // is at least one char, so this drops out cleanly.
    const line = JSON.stringify({ project_id: '' });
    expect(extractProjectId(line)).toBeNull();
  });

  it('falls back to JSON.parse when properties also has a project_id (after)', () => {
    // Top-level project_id is serialized first (event.service.ts order).
    // Fast path would still match it correctly here, but the helper
    // detects the second occurrence and routes to JSON.parse for safety.
    const line = JSON.stringify({
      id: 'evt1',
      project_id: 'real-project',
      properties: { project_id: 'user-supplied' },
    });
    expect(extractProjectId(line)).toBe('real-project');
  });

  it('falls back to JSON.parse when properties has project_id BEFORE top-level', () => {
    // This is the bug case the regex couldn't handle. If a future
    // refactor swaps the field order in the event constructor, the
    // fast path would attribute counts to the wrong project. The
    // fallback fixes that: as soon as we see two occurrences we
    // resolve via real JSON.parse and pick the top-level key.
    const line = JSON.stringify({
      properties: { project_id: 'user-supplied' },
      project_id: 'real-project',
    });
    expect(extractProjectId(line)).toBe('real-project');
  });

  it('does not confuse escaped quotes in a string value with the real field', () => {
    // A user types `"project_id":"x"` inside a property value. After
    // JSON.stringify, those quotes are escaped (`\"`), so the
    // indexOf scan for `"project_id":"` (no backslash) can't match
    // them. Only the real top-level field is found.
    const line = JSON.stringify({
      id: 'evt1',
      project_id: 'real-project',
      properties: { note: 'has "project_id":"fake" inside' },
    });
    expect(extractProjectId(line)).toBe('real-project');
  });

  it('handles a project_id nested deep inside properties (fallback path)', () => {
    const line = JSON.stringify({
      project_id: 'real-project',
      properties: { nested: { project_id: 'deep-fake' } },
    });
    expect(extractProjectId(line)).toBe('real-project');
  });
});
