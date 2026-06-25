/**
 * Integration tests for batch ingestion via POST /track with
 * `{ type: 'batch', payload: [event, ...] }`.
 *
 * Side effects (queue, db, geo, redis) are mocked so the test runs without
 * Docker. Auth uses the same getClientByIdCached mock as the insights
 * router tests, except here we don't need real fixtures — we never read
 * from PG/CH, we only verify the controller dispatches each item correctly.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks (hoisted before imports) ────────────────────────────────────
//
// `vi.mock` is hoisted above all top-level statements, so any spies the factory
// references must be created via `vi.hoisted(...)` (also hoisted) — otherwise
// the factory runs first and hits a temporal-dead-zone ReferenceError.

const { queueAdd, upsertProfileMock } = vi.hoisted(() => ({
  queueAdd: vi.fn().mockResolvedValue(undefined),
  upsertProfileMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@openpanel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/db')>();
  return {
    ...actual,
    getClientByIdCached: vi.fn(),
    getSalts: vi.fn().mockResolvedValue({ current: 'salt-a', previous: 'salt-b' }),
    getProfileById: vi.fn().mockResolvedValue(null),
    upsertProfile: upsertProfileMock,
    groupBuffer: { add: vi.fn().mockResolvedValue(undefined) },
    replayBuffer: { add: vi.fn().mockResolvedValue(undefined) },
  };
});

vi.mock('@openpanel/queue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/queue')>();
  return {
    ...actual,
    getEventsGroupQueueShard: vi.fn(() => ({ add: queueAdd })),
  };
});

vi.mock('@openpanel/geo', () => ({
  getGeoLocation: vi.fn().mockResolvedValue({
    country: 'US',
    city: 'San Francisco',
    region: 'CA',
    longitude: -122.4,
    latitude: 37.77,
  }),
}));

vi.mock('@openpanel/common/server', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@openpanel/common/server')>();
  return {
    ...actual,
    verifyPassword: vi.fn().mockResolvedValue(true),
    generateDeviceId: vi.fn().mockReturnValue('device-test'),
  };
});

vi.mock('@openpanel/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/redis')>();
  const fakeRedisClient = new Proxy(
    {},
    {
      get: (_t, p) => {
        if (p === 'status') return 'ready';
        if (p === 'multi') {
          return () => ({
            hget: vi.fn().mockReturnThis(),
            exec: vi.fn().mockResolvedValue([]),
          });
        }
        return vi.fn().mockResolvedValue(null);
      },
    },
  );
  return {
    ...actual,
    getCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) =>
      fn(),
    getLock: vi.fn().mockResolvedValue(true),
    getRedisCache: vi.fn().mockReturnValue(fakeRedisClient),
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { ClientType, getClientByIdCached } from '@openpanel/db';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';

// ─── Test client constants ────────────────────────────────────────────────────

const CLIENT_ID = '00000000-0000-0000-0000-0000000000aa';
const CLIENT_SECRET = 'test-secret';
const PROJECT_ID = 'test-project';
const ORG_ID = 'test-org';

const AUTH = {
  'openpanel-client-id': CLIENT_ID,
  'openpanel-client-secret': CLIENT_SECRET,
  'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/120.0.0.0',
  'content-type': 'application/json',
};

const WRITE_CLIENT = {
  id: CLIENT_ID,
  type: ClientType.write,
  projectId: PROJECT_ID,
  organizationId: ORG_ID,
  secret: 'hashed-secret',
  name: 'Batch Test Client',
  cors: ['*'],
  description: '',
  ignoreCorsAndSecret: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  project: {
    id: PROJECT_ID,
    organizationId: ORG_ID,
    cors: ['*'],
    filters: [],
    allowUnsafeRevenueTracking: true,
  },
};

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  vi.mocked(getClientByIdCached).mockResolvedValue(WRITE_CLIENT as any);
  app = await buildApp({ testing: true });
  await app.ready();
}, 30_000);

afterAll(async () => {
  await app.close();
}, 10_000);

beforeEach(() => {
  queueAdd.mockClear();
  upsertProfileMock.mockClear();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function postTrack(body: unknown, headers: Record<string, string> = AUTH) {
  return app.inject({
    method: 'POST',
    url: '/track',
    headers,
    payload: body as any,
  });
}

function postBatch(events: unknown, headers: Record<string, string> = AUTH) {
  return postTrack({ type: 'batch', payload: events }, headers);
}

const validTrack = (name = 'page_view') => ({
  type: 'track' as const,
  payload: { name, properties: { __path: '/home' } },
});

const validIdentify = (profileId = 'user-1') => ({
  type: 'identify' as const,
  payload: { profileId, email: 'a@b.com' },
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /track type=batch — auth & envelope', () => {
  it('returns 401 without client-id', async () => {
    const res = await postBatch([validTrack()], {
      'content-type': 'application/json',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 on empty payload array', async () => {
    const res = await postBatch([]);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on missing payload field', async () => {
    const res = await postTrack({ type: 'batch' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when array exceeds the per-request cap', async () => {
    const events = Array.from({ length: 2001 }, () => validTrack());
    const res = await postBatch(events);
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /track type=batch — happy path', () => {
  it('accepts a single track event and queues it', async () => {
    const res = await postBatch([validTrack()]);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body).toEqual({ accepted: 1, rejected: [] });
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });

  it('accepts a mixed batch (track + identify) and dispatches each', async () => {
    const res = await postBatch([
      validTrack('signup'),
      validIdentify('alice'),
      validTrack('purchase'),
    ]);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 3, rejected: [] });
    expect(queueAdd).toHaveBeenCalledTimes(2); // two `track` events
    expect(upsertProfileMock).toHaveBeenCalledTimes(1); // one `identify`
  });

  it('treats each event as if sent one by one (per-event queue add)', async () => {
    const events = Array.from({ length: 5 }, (_, i) => validTrack(`event_${i}`));
    const res = await postBatch(events);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 5, rejected: [] });
    expect(queueAdd).toHaveBeenCalledTimes(5);
  });

  it('still handles a single-event body (non-batch) with a 200', async () => {
    // Regression guard: adding the batch variant to the /track body schema
    // must not change the single-event contract.
    const res = await postTrack(validTrack('single_event_probe'));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('deviceId');
    expect(body).toHaveProperty('sessionId');
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });

  it('still rejects a single-event alias body with a 400', async () => {
    const res = await postTrack({
      type: 'alias',
      payload: { profileId: 'user-1', alias: 'u1' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('marks dispatch failures as internal rejections', async () => {
    queueAdd.mockRejectedValueOnce(new Error('queue unavailable'));
    const res = await postBatch([validTrack('internal_error_probe')]);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.accepted).toBe(0);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]).toMatchObject({ index: 0, reason: 'internal' });
  });

  it('dispatches every supported event type through the shared pipeline', async () => {
    const now = new Date().toISOString();
    const res = await postBatch([
      { type: 'group', payload: { id: 'g-1', type: 'company', name: 'Acme' } },
      {
        type: 'assign_group',
        payload: { groupIds: ['g-1'], profileId: 'user-1' },
      },
      // getProfileById is mocked to null → 404 → per-row validation reject
      {
        type: 'increment',
        payload: { profileId: 'missing', property: 'visits' },
      },
      {
        type: 'decrement',
        payload: { profileId: 'missing', property: 'visits' },
      },
      // sessionId falls back to the deterministic bucket → replay accepted
      {
        type: 'replay',
        payload: {
          chunk_index: 0,
          events_count: 1,
          is_full_snapshot: true,
          started_at: now,
          ended_at: now,
          payload: 'chunk',
        },
      },
    ]);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.accepted).toBe(3); // group + assign_group + replay
    expect(body.rejected).toHaveLength(2); // increment + decrement
    expect(
      body.rejected.every((r: { reason: string }) => r.reason === 'validation'),
    ).toBe(true);
  });

  it('fetches geo per event when __ip overrides the request ip', async () => {
    const res = await postBatch([
      {
        type: 'track' as const,
        payload: { name: 'ip_probe', properties: { __ip: '203.0.113.9' } },
      },
    ]);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 1, rejected: [] });
  });

  it('rejects non-object items with a top-level validation message', async () => {
    const res = await postBatch([42]);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.accepted).toBe(0);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0].reason).toBe('validation');
    expect(body.rejected[0].error).toBeTruthy();
  });

  it('flags historical events with isTimestampFromThePast and keeps __timestamp', async () => {
    // Batch items go through the exact same timestamp rules as single
    // events: a __timestamp older than 15 minutes is accepted and flagged
    // so the worker skips live-session handling for it.
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const res = await postBatch([
      {
        type: 'track' as const,
        payload: {
          name: 'probe_historical',
          properties: { __timestamp: new Date(twoHoursAgo).toISOString() },
        },
      },
    ]);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 1, rejected: [] });
    expect(queueAdd).toHaveBeenCalledTimes(1);
    const queuedJob = queueAdd.mock.calls[0]?.[0];
    expect(queuedJob.data.event.timestamp).toBe(twoHoursAgo);
    expect(queuedJob.data.event.isTimestampFromThePast).toBe(true);
  });

  it('passes a client-supplied __deviceId through to the queue', async () => {
    const res = await postBatch([
      {
        type: 'track' as const,
        payload: {
          name: 'probe_device_override',
          properties: { __deviceId: 'mobile-device-abc', __path: '/home' },
        },
      },
    ]);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 1, rejected: [] });
    expect(queueAdd).toHaveBeenCalledTimes(1);
    const queuedJob = queueAdd.mock.calls[0]?.[0];
    expect(queuedJob.data.deviceId).toBe('mobile-device-abc');
  });
});

describe('POST /track type=batch — per-item validation', () => {
  it('rejects bad rows by index without failing the batch', async () => {
    const res = await postBatch([
      validTrack('good_1'),
      { type: 'track', payload: { name: '' } }, // empty name → invalid
      validTrack('good_2'),
      { type: 'wrong-type', payload: {} }, // unknown discriminator
    ]);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.accepted).toBe(2);
    expect(body.rejected).toHaveLength(2);
    expect(body.rejected.map((r: { index: number }) => r.index).sort()).toEqual([1, 3]);
    expect(body.rejected.every((r: { reason: string }) => r.reason === 'validation')).toBe(true);
    expect(queueAdd).toHaveBeenCalledTimes(2);
  });

  it('rejects alias as per-item validation (does not 400 the whole batch)', async () => {
    const res = await postBatch([
      validTrack(),
      { type: 'alias', payload: { profileId: 'user-1', alias: 'u1' } },
    ]);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.accepted).toBe(1);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]).toMatchObject({
      index: 1,
      reason: 'validation',
    });
    expect(body.rejected[0].error).toMatch(/alias/i);
  });

  it('rejects a nested batch envelope as a per-item validation error', async () => {
    // `batch` is only valid at the top level — items are validated against
    // the single-event union, so recursion is impossible by construction.
    const res = await postBatch([
      validTrack(),
      { type: 'batch', payload: [validTrack()] },
    ]);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.accepted).toBe(1);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]).toMatchObject({
      index: 1,
      reason: 'validation',
    });
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });

  it('returns 202 with accepted=0 when every event fails validation', async () => {
    const res = await postBatch([
      { type: 'track', payload: { name: '' } },
      { type: 'track', payload: {} },
      { type: 'identify', payload: {} },
    ]);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.accepted).toBe(0);
    expect(body.rejected).toHaveLength(3);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  // Regression: per-event processing is chunked (BATCH_CONCURRENCY = 50).
  // A 200-event batch spans 4 chunks. Verifies that rejected indices land in
  // the right positions across chunk boundaries — including the very first
  // event in chunk 1, the last event in chunk 2, and one in chunk 4 — which
  // would catch off-by-one slicing or out-of-order result accumulation.
  it('preserves per-index results across chunk boundaries', async () => {
    const SIZE = 200;
    const badIndices = new Set([0, 50, 99, 100, 149, 199]);
    const events = Array.from({ length: SIZE }, (_, i) =>
      badIndices.has(i)
        ? { type: 'track', payload: { name: '' } } // invalid
        : validTrack(`chunked_${i}`),
    );
    const res = await postBatch(events);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.accepted).toBe(SIZE - badIndices.size);
    expect(body.rejected).toHaveLength(badIndices.size);
    const rejectedIndices = new Set(
      body.rejected.map((r: { index: number }) => r.index),
    );
    expect(rejectedIndices).toEqual(badIndices);
    expect(queueAdd).toHaveBeenCalledTimes(SIZE - badIndices.size);
  });
});
