/**
 * Integration tests for the /insights/* REST routes.
 *
 * Auth is mocked (getClientByIdCached, verifyPassword, getCache).
 * ClickHouse and Postgres are real — uses the local Docker instance (pnpm dock:up).
 *
 * Fixture data (see apps/api/src/tests/setup.ts):
 *   Alice   — 3 events: session_start, page_view(/home), session_end  — 2 days ago — Chrome / US
 *   Charlie — 5 events: session_start, screen_view, page_view(/shop), purchase, session_end — 5 days ago — Firefox
 *             2 sessions (sess-charlie-1 5d ago, sess-charlie-2 10d ago)
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// ─── Module mocks (hoisted before imports) ────────────────────────────────────

// Mock only getClientByIdCached so auth can be controlled per-test.
// importOriginal is fine here because real Postgres is available.
vi.mock('@openpanel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/db')>();
  return { ...actual, getClientByIdCached: vi.fn() };
});

// Password verification is always truthy in tests.
vi.mock('@openpanel/common/server', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@openpanel/common/server')>();
  return { ...actual, verifyPassword: vi.fn().mockResolvedValue(true) };
});

// Bypass Redis caching — no real ioredis connections in tests.
// getRedisCache must return a truthy object so that @trpc-limiter/redis's
// RateLimiterRedis constructor doesn't throw "storeClient is not set".
vi.mock('@openpanel/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/redis')>();
  const fakeRedisClient = new Proxy(
    {},
    {
      get: (_t, p) =>
        p === 'status' ? 'ready' : vi.fn().mockResolvedValue(null),
    }
  );
  return {
    ...actual,
    getCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) =>
      fn(),
    getRedisCache: vi.fn().mockReturnValue(fakeRedisClient),
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { ClientType, getClientByIdCached } from '@openpanel/db';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { FIXTURE, TEST_ORG_ID, TEST_PROJECT_ID } from '../../../../test/global-setup';

// ─── Test client constants ────────────────────────────────────────────────────

const CLIENT_ID = '00000000-0000-0000-0000-000000000099';
const CLIENT_SECRET = 'test-secret';

const AUTH = {
  'openpanel-client-id': CLIENT_ID,
  'openpanel-client-secret': CLIENT_SECRET,
};

/** Minimal shape that satisfies validateExportRequest */
const READ_CLIENT = {
  id: CLIENT_ID,
  type: ClientType.read,
  projectId: TEST_PROJECT_ID,
  organizationId: TEST_ORG_ID,
  secret: 'hashed-secret',
  name: 'Test Client',
  cors: null,
  description: '',
  ignoreCorsAndSecret: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  project: null,
};

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  vi.mocked(getClientByIdCached).mockResolvedValue(READ_CLIENT as any);
  app = await buildApp({ testing: true });
  await app.ready();
}, 30_000);

afterAll(async () => {
  await app.close();
}, 10_000);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function get(path: string, headers: Record<string, string> = AUTH) {
  return app.inject({ method: 'GET', url: path, headers });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('auth', () => {
  it('returns 401 when no client-id header is present', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/events/names`, {});
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when client-id is not a valid UUID', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/events/names`, {
      'openpanel-client-id': 'not-a-uuid',
      'openpanel-client-secret': CLIENT_SECRET,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with valid credentials', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/events/names`);
    expect(res.statusCode).toBe(200);
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────

describe('GET /insights/:projectId/events/names', () => {
  it('returns event_names array', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/events/names`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('includes events from fixture data', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/events/names`);
    const body = res.json();
    expect(body).toContain('session_start');
    expect(body).toContain('page_view');
    expect(body).toContain('session_end');
  });
});

describe('GET /insights/:projectId/events', () => {
  it('returns events array', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/events`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('respects limit parameter', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/events?limit=2`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBeLessThanOrEqual(2);
  });

  it('filters by eventNames', async () => {
    const res = await get(
      `/insights/${TEST_PROJECT_ID}/events?eventNames=purchase`
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.every((e: any) => e.name === 'purchase')).toBe(true);
  });

  it('returns 400 when limit is out of range', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/events?limit=9999`);
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /insights/:projectId/events/properties', () => {
  it('returns columns + properties arrays', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/events/properties`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.columns)).toBe(true);
    expect(body.columns).toContain('path');
    expect(Array.isArray(body.properties)).toBe(true);
  });
});

describe('GET /insights/:projectId/events/property_values', () => {
  it('returns values for a known property', async () => {
    const res = await get(
      `/insights/${TEST_PROJECT_ID}/events/property_values?eventName=page_view&propertyKey=path`
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.values)).toBe(true);
  });

  it('returns 400 when required params are missing', async () => {
    const res = await get(
      `/insights/${TEST_PROJECT_ID}/events/property_values?eventName=page_view`
    );
    expect(res.statusCode).toBe(400);
  });
});

// ─── Profiles ─────────────────────────────────────────────────────────────────

describe('GET /insights/:projectId/profiles', () => {
  it('returns profiles array', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/profiles`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('includes fixture profiles', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/profiles`);
    const body = res.json();
    const emails = body.map((p: any) => p.email);
    expect(emails).toContain('alice@example.com');
    expect(emails).toContain('charlie@example.com');
  });

  it('filters by browser via query params', async () => {
    const res = await get(
      `/insights/${TEST_PROJECT_ID}/profiles?browser=Firefox`
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Charlie uses Firefox; Alice uses Chrome — only Charlie should appear
    const emails = body.map((p: any) => p.email);
    expect(emails).toContain('charlie@example.com');
    expect(emails).not.toContain('alice@example.com');
  });
});

describe('GET /insights/:projectId/profiles/:profileId', () => {
  it('returns 404 for unknown profile', async () => {
    const res = await get(
      `/insights/${TEST_PROJECT_ID}/profiles/does-not-exist`
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns profile data for known profile', async () => {
    const res = await get(
      `/insights/${TEST_PROJECT_ID}/profiles/${FIXTURE.profiles.alice}`
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('profile');
    expect(body.profile.email).toBe('alice@example.com');
  });
});

describe('GET /insights/:projectId/profiles/:profileId/sessions', () => {
  it('returns sessions for charlie', async () => {
    const res = await get(
      `/insights/${TEST_PROJECT_ID}/profiles/${FIXTURE.profiles.charlie}/sessions`
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

describe('GET /insights/:projectId/sessions', () => {
  it('returns sessions array', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/sessions`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('fixture has at least 3 sessions (alice-1, charlie-1, charlie-2)', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/sessions?limit=100`);
    const body = res.json();
    expect(body.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Analytics overview ───────────────────────────────────────────────────────

describe('GET /insights/:projectId/overview', () => {
  it('returns analytics overview', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/overview`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Overview returns an object with at least some metrics
    expect(typeof body).toBe('object');
  });

  it('accepts interval param', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/overview?interval=day`);
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 for invalid interval', async () => {
    const res = await get(
      `/insights/${TEST_PROJECT_ID}/overview?interval=invalid`
    );
    expect(res.statusCode).toBe(400);
  });
});

// ─── Funnel ───────────────────────────────────────────────────────────────────

describe('GET /insights/:projectId/funnel', () => {
  it('returns funnel data for valid steps', async () => {
    const res = await get(
      `/insights/${TEST_PROJECT_ID}/funnel?steps=session_start&steps=session_end`
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body).toBe('object');
  });

  it('returns 400 when fewer than 2 steps are provided', async () => {
    const res = await get(
      `/insights/${TEST_PROJECT_ID}/funnel?steps[]=session_start`
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when steps param is missing entirely', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/funnel`);
    expect(res.statusCode).toBe(400);
  });
});

// ─── Pages ────────────────────────────────────────────────────────────────────

describe('GET /insights/:projectId/pages/top', () => {
  it('returns top pages', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/pages/top`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('GET /insights/:projectId/pages/entry_exit', () => {
  it('defaults to entry mode', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/pages/entry_exit`);
    expect(res.statusCode).toBe(200);
  });

  it('accepts mode=exit', async () => {
    const res = await get(
      `/insights/${TEST_PROJECT_ID}/pages/entry_exit?mode=exit`
    );
    expect(res.statusCode).toBe(200);
  });
});

// ─── Traffic ──────────────────────────────────────────────────────────────────

describe('GET /insights/:projectId/traffic/referrers', () => {
  it('returns referrer breakdown', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/traffic/referrers`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('GET /insights/:projectId/traffic/geo', () => {
  it('returns geo breakdown', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/traffic/geo`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('GET /insights/:projectId/traffic/devices', () => {
  it('returns device breakdown', async () => {
    const res = await get(`/insights/${TEST_PROJECT_ID}/traffic/devices`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
