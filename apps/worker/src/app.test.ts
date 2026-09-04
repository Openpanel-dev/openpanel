/**
 * The queue dashboard is mounted at `/` and therefore catches every path that
 * nothing before it claimed. These tests pin down two things: it is not
 * reachable without credentials, and it never shadows the metrics or health
 * routes that container orchestration and Prometheus call with no credentials.
 *
 * The queue, db and redis modules are replaced wholesale — the routes are
 * exercised over a real socket, but nothing here talks to a datastore.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { makeQueue } = vi.hoisted(() => {
  const makeQueue = (name: string) => ({
    name,
    // BullMQAdapter refuses anything that does not look like a BullMQ queue.
    metaValues: { version: 'bullmq5.0.0' },
    getJobCounts: async () => ({
      active: 0,
      waiting: 0,
      'waiting-children': 0,
      prioritized: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0,
    }),
    isPaused: async () => false,
    getJobs: async () => [],
  });
  return { makeQueue };
});

vi.mock('@openpanel/queue', () => ({
  eventsGroupQueues: [],
  sessionsQueue: makeQueue('sessions'),
  cronQueue: makeQueue('cron'),
  notificationQueue: makeQueue('notification'),
  importQueue: makeQueue('import'),
  insightsQueue: makeQueue('insights'),
  gscQueue: makeQueue('gsc'),
  cohortComputeQueue: makeQueue('cohortCompute'),
}));

vi.mock('@openpanel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/db')>();
  return {
    ...actual,
    db: { $executeRaw: async () => 1 },
    chQuery: async () => [{ 1: 1 }],
  };
});

vi.mock('@openpanel/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/redis')>();
  return { ...actual, getRedisCache: () => ({ ping: async () => 'PONG' }) };
});

// The local-only cron trigger routes drag in every job module; they are not
// what is under test.
vi.mock('./boot-debug', () => ({ bootDebugRoutes: vi.fn() }));

// An empty registry — the real one has collectors that scrape Redis and
// ClickHouse. What matters here is that /metrics answers, not what it says.
vi.mock('./metrics', async () => {
  const client = (await import('prom-client')).default;
  return { register: new client.Registry() };
});

import { createApp } from './app';

const USERNAME = 'queues';
const PASSWORD = 'correct-horse';

const basic = (username: string, password: string) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

let server: Server | undefined;

/** Boots the app on an ephemeral port and returns its origin. */
async function boot() {
  const app = createApp();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const OPEN_ROUTES = [
  '/healthcheck',
  '/healthz/live',
  '/healthz/ready',
  '/metrics',
];

beforeEach(() => {
  for (const key of [
    'BULLBOARD_USERNAME',
    'BULLBOARD_PASSWORD',
    'BULLBOARD_READONLY',
    'DISABLE_BULLBOARD',
  ]) {
    delete process.env[key];
  }
});

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server?.close(resolve));
    server = undefined;
  }
});

describe('worker http app', () => {
  describe('with credentials configured', () => {
    beforeEach(() => {
      process.env.BULLBOARD_USERNAME = USERNAME;
      process.env.BULLBOARD_PASSWORD = PASSWORD;
    });

    it('rejects the dashboard and its api without an Authorization header', async () => {
      const origin = await boot();

      for (const path of ['/', '/api/queues']) {
        const res = await fetch(`${origin}${path}`);
        expect(res.status, path).toBe(401);
        expect(res.headers.get('www-authenticate')).toMatch(/^Basic/);
      }
    });

    it('rejects a mutating route without an Authorization header', async () => {
      const origin = await boot();

      const res = await fetch(`${origin}/api/queues/cron/pause`, {
        method: 'PUT',
      });

      expect(res.status).toBe(401);
    });

    it('rejects a wrong password of the same length as the right one', async () => {
      const origin = await boot();
      const wrong = `${'x'.repeat(PASSWORD.length - 1)}y`;
      expect(wrong).toHaveLength(PASSWORD.length);

      const res = await fetch(`${origin}/api/queues`, {
        headers: { authorization: basic(USERNAME, wrong) },
      });

      expect(res.status).toBe(401);
    });

    it('serves the queue list, read-only, with the right credentials', async () => {
      const origin = await boot();

      const res = await fetch(`${origin}/api/queues`, {
        headers: { authorization: basic(USERNAME, PASSWORD) },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        queues: {
          name: string;
          readOnlyMode: boolean;
          allowRetries: boolean;
        }[];
      };
      expect(body.queues.map((queue) => queue.name)).toContain('cron');
      expect(body.queues.every((queue) => queue.readOnlyMode)).toBe(true);
      expect(body.queues.some((queue) => queue.allowRetries)).toBe(false);
    });

    it('allows writes when BULLBOARD_READONLY is turned off', async () => {
      process.env.BULLBOARD_READONLY = '0';
      const origin = await boot();

      const res = await fetch(`${origin}/api/queues`, {
        headers: { authorization: basic(USERNAME, PASSWORD) },
      });

      const body = (await res.json()) as {
        queues: { readOnlyMode: boolean; allowRetries: boolean }[];
      };
      expect(body.queues.every((queue) => queue.readOnlyMode)).toBe(false);
      expect(body.queues.every((queue) => queue.allowRetries)).toBe(true);
    });
  });

  it('does not mount the dashboard when no credentials are configured', async () => {
    const origin = await boot();

    const res = await fetch(`${origin}/api/queues`);

    expect(res.status).toBe(404);
  });

  it('does not mount the dashboard when DISABLE_BULLBOARD is set', async () => {
    process.env.DISABLE_BULLBOARD = '1';
    process.env.BULLBOARD_USERNAME = USERNAME;
    process.env.BULLBOARD_PASSWORD = PASSWORD;
    const origin = await boot();

    const res = await fetch(`${origin}/api/queues`);

    expect(res.status).toBe(404);
  });

  describe.each([
    ['no credentials', {}],
    [
      'credentials set',
      { BULLBOARD_USERNAME: USERNAME, BULLBOARD_PASSWORD: PASSWORD },
    ],
    [
      'dashboard disabled',
      {
        DISABLE_BULLBOARD: '1',
        BULLBOARD_USERNAME: USERNAME,
        BULLBOARD_PASSWORD: PASSWORD,
      },
    ],
  ])('metrics and health with %s', (_label, env) => {
    it('answer without credentials', async () => {
      Object.assign(process.env, env);
      const origin = await boot();

      for (const path of OPEN_ROUTES) {
        const res = await fetch(`${origin}${path}`);
        expect(res.status, path).not.toBe(401);
        expect(res.status, path).toBe(200);
      }
    });
  });
});
