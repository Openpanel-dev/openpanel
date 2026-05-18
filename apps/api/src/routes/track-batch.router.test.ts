/**
 * Integration tests for POST /track/batch.
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

function postBatch(body: unknown, headers: Record<string, string> = AUTH) {
  return app.inject({
    method: 'POST',
    url: '/track/batch',
    headers,
    payload: body as any,
  });
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

describe('POST /track/batch — auth & envelope', () => {
  it('returns 401 without client-id', async () => {
    const res = await postBatch({ events: [validTrack()] }, {
      'content-type': 'application/json',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 on empty events array', async () => {
    const res = await postBatch({ events: [] });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on missing events field', async () => {
    const res = await postBatch({});
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when array exceeds the per-request cap', async () => {
    const events = Array.from({ length: 2001 }, () => validTrack());
    const res = await postBatch({ events });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /track/batch — happy path', () => {
  it('accepts a single track event and queues it', async () => {
    const res = await postBatch({ events: [validTrack()] });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body).toEqual({ accepted: 1, rejected: [] });
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });

  it('accepts a mixed batch (track + identify) and dispatches each', async () => {
    const res = await postBatch({
      events: [validTrack('signup'), validIdentify('alice'), validTrack('purchase')],
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 3, rejected: [] });
    expect(queueAdd).toHaveBeenCalledTimes(2); // two `track` events
    expect(upsertProfileMock).toHaveBeenCalledTimes(1); // one `identify`
  });

  it('treats each event as if sent one by one (per-event queue add)', async () => {
    const events = Array.from({ length: 5 }, (_, i) => validTrack(`event_${i}`));
    const res = await postBatch({ events });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 5, rejected: [] });
    expect(queueAdd).toHaveBeenCalledTimes(5);
  });
});

describe('POST /track/batch — per-item validation', () => {
  it('rejects bad rows by index without failing the batch', async () => {
    const res = await postBatch({
      events: [
        validTrack('good_1'),
        { type: 'track', payload: { name: '' } }, // empty name → invalid
        validTrack('good_2'),
        { type: 'wrong-type', payload: {} }, // unknown discriminator
      ],
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.accepted).toBe(2);
    expect(body.rejected).toHaveLength(2);
    expect(body.rejected.map((r: { index: number }) => r.index).sort()).toEqual([1, 3]);
    expect(body.rejected.every((r: { reason: string }) => r.reason === 'validation')).toBe(true);
    expect(queueAdd).toHaveBeenCalledTimes(2);
  });

  it('rejects alias as per-item validation (does not 400 the whole batch)', async () => {
    const res = await postBatch({
      events: [
        validTrack(),
        { type: 'alias', payload: { profileId: 'user-1', alias: 'u1' } },
      ],
    });
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

  it('returns 202 with accepted=0 when every event fails validation', async () => {
    const res = await postBatch({
      events: [
        { type: 'track', payload: { name: '' } },
        { type: 'track', payload: {} },
        { type: 'identify', payload: {} },
      ],
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.accepted).toBe(0);
    expect(body.rejected).toHaveLength(3);
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
