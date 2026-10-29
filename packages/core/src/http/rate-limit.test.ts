// The prefix table IS the contract: it must match the published rate limits,
// and the paths the docs call unlimited must stay absent from it.

import { afterAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { getRedisCache } from '@openpanel/redis';
import type { Logger } from '../logger';
import {
  bucketsFor,
  fingerprintFor,
  HTTP_RATE_LIMITS,
  isRateLimited,
  limitFor,
} from './rate-limit';

const DEFAULT_IP_HEADERS = {
  attributionOrder: undefined,
  trustedOrder: undefined,
};

// The published rate-limits page's numbers, for the first three entries;
// `/mcp` and `/misc/favicon` are pinned here only.
const PUBLISHED_LIMITS = {
  '/manage/clients': { max: 20, windowMs: 10_000 },
  '/export/events': { max: 100, windowMs: 10_000 },
  '/insights/acme-web/overview': { max: 100, windowMs: 10_000 },
  '/mcp': { max: 60, windowMs: 60_000 },
  '/misc/favicon': { max: 100, windowMs: 10_000 },
} as const;

describe('HTTP rate limits', () => {
  test('each documented surface keeps its published numbers', () => {
    for (const [path, expected] of Object.entries(PUBLISHED_LIMITS)) {
      const limit = limitFor(path);
      expect([path, limit?.max, limit?.windowMs]).toEqual([
        path,
        expected.max,
        expected.windowMs,
      ]);
    }
  });

  // The same page promises these are unlimited. A prefix added carelessly
  // here would start throttling ingestion.
  test('the ingestion paths are not limited', () => {
    for (const path of [
      '/track',
      '/track/device-id',
      '/profile',
      '/profile/increment',
      '/import/events',
      '/healthcheck',
      '/metrics',
    ]) {
      expect([path, limitFor(path)]).toEqual([path, undefined]);
    }
  });

  test('every entry names a scope, so buckets cannot collide', () => {
    const scopes = HTTP_RATE_LIMITS.map((limit) => limit.scope);
    expect(new Set(scopes).size).toBe(scopes.length);
    expect(scopes.every(Boolean)).toBe(true);
  });

  test('only the favicon route under /misc is limited', () => {
    expect(limitFor('/misc/favicon')?.scope).toBe('favicon');
    expect(limitFor('/misc/ping')).toBeUndefined();
    expect(limitFor('/misc/stats')).toBeUndefined();
  });
});

describe('rate-limit buckets', () => {
  const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
  const ROTATED_ID = '22222222-2222-4222-8222-222222222222';
  const mcpToken = Buffer.from(`${CLIENT_ID}:wrong-secret`).toString('base64');

  test('a public route ignores the client-id header', () => {
    const request = new Request('https://api.test/misc/favicon', {
      headers: { 'openpanel-client-id': ROTATED_ID },
    });
    expect(
      fingerprintFor('ip', { request, ipHeaders: DEFAULT_IP_HEADERS })
    ).toBe('ip:unknown');
  });

  test('MCP buckets on the token, not on a rotated header', () => {
    const request = new Request(`https://api.test/mcp?token=${mcpToken}`, {
      headers: { 'openpanel-client-id': ROTATED_ID },
    });
    expect(
      fingerprintFor('mcp-token', { request, ipHeaders: DEFAULT_IP_HEADERS })
    ).toBe(`client:${CLIENT_ID}`);

    const bearer = new Request('https://api.test/mcp', {
      headers: { authorization: `Bearer ${mcpToken}` },
    });
    expect(
      fingerprintFor('mcp-token', {
        request: bearer,
        ipHeaders: DEFAULT_IP_HEADERS,
      })
    ).toBe(`client:${CLIENT_ID}`);
  });

  test('authenticated surfaces bucket on the client they authenticate', () => {
    const request = new Request('https://api.test/export/events', {
      headers: { 'openpanel-client-id': CLIENT_ID },
    });
    expect(
      fingerprintFor('client', { request, ipHeaders: DEFAULT_IP_HEADERS })
    ).toBe(`client:${CLIENT_ID}`);
  });

  test('the address budget ignores a caller-set ip header', () => {
    const request = new Request('https://api.test/export/events', {
      headers: { 'x-client-ip': '8.8.8.8', 'x-real-ip': '1.1.1.1' },
    });
    expect(
      fingerprintFor('ip', { request, ipHeaders: DEFAULT_IP_HEADERS })
    ).toBe('ip:1.1.1.1');
  });

  test('the address budget follows the deployment trusted header order', () => {
    const request = new Request('https://api.test/export/events', {
      headers: { 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '9.9.9.9' },
    });
    const ipHeaders = {
      attributionOrder: undefined,
      trustedOrder: ['x-real-ip'],
    };
    expect(fingerprintFor('ip', { request, ipHeaders })).toBe('ip:9.9.9.9');
  });

  test('client surfaces also count every request against the address', () => {
    for (const path of [
      '/manage/clients',
      '/export/events',
      '/insights/x',
      '/mcp',
    ]) {
      const limit = limitFor(path);
      if (!limit) {
        throw new Error(`no limit for ${path}`);
      }
      const buckets = (clientId: string) =>
        bucketsFor(limit, {
          request: new Request(
            `https://api.test${path}?token=${Buffer.from(`${clientId}:s`).toString('base64')}`,
            {
              headers: {
                'openpanel-client-id': clientId,
                'cf-connecting-ip': '1.1.1.1',
              },
            }
          ),
          ipHeaders: DEFAULT_IP_HEADERS,
        }).map((bucket) => bucket.key);

      const [firstClient, firstAddress] = buckets(CLIENT_ID);
      const [rotatedClient, rotatedAddress] = buckets(ROTATED_ID);
      expect(rotatedClient).not.toBe(firstClient);
      expect(rotatedAddress).toBe(firstAddress);
      expect(firstAddress).toBe(`rl:http:${limit.scope}:budget:ip:1.1.1.1`);
      expect(limit.ipBudget?.max ?? 0).toBeGreaterThan(limit.max);
    }
  });

  test('the address budget falls back to the socket address', () => {
    const request = new Request('https://api.test/manage/clients', {
      headers: { 'openpanel-client-id': CLIENT_ID },
    });
    const limit = limitFor('/manage/clients');
    if (!limit) {
      throw new Error('no limit for /manage');
    }
    const keys = bucketsFor(limit, {
      request,
      ipHeaders: DEFAULT_IP_HEADERS,
      remoteAddress: '10.0.0.5',
    }).map((bucket) => bucket.key);
    expect(keys).toEqual([
      `rl:http:manage:client:${CLIENT_ID}`,
      'rl:http:manage:budget:ip:10.0.0.5',
    ]);
  });

  test('a public route has no second bucket', () => {
    const limit = limitFor('/misc/favicon');
    if (!limit) {
      throw new Error('no limit for /misc/favicon');
    }
    const request = new Request('https://api.test/misc/favicon');
    expect(
      bucketsFor(limit, { request, ipHeaders: DEFAULT_IP_HEADERS })
    ).toHaveLength(1);
  });
});

describe('rate-limit address budget', () => {
  const scope = `test-${randomUUID()}`;
  const silentLogger: Logger = {
    fatal: () => undefined,
    error: () => undefined,
    warn: () => undefined,
    info: () => undefined,
    debug: () => undefined,
    trace: () => undefined,
    child: () => silentLogger,
  };

  afterAll(async () => {
    const redis = getRedisCache();
    const keys = await redis.keys(`rl:http:${scope}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  test('rotating the client id does not escape the address budget', async () => {
    const limit = {
      scope,
      keyBy: 'client',
      max: 100,
      windowMs: 10_000,
      ipBudget: { max: 3, windowMs: 10_000 },
    } as const;
    const attempt = () =>
      isRateLimited(
        limit,
        {
          request: new Request('https://api.test/manage/clients', {
            headers: {
              'openpanel-client-id': randomUUID(),
              'cf-connecting-ip': '1.1.1.1',
            },
          }),
          ipHeaders: DEFAULT_IP_HEADERS,
        },
        silentLogger
      );

    const results: boolean[] = [];
    for (let index = 0; index < 5; index++) {
      results.push(await attempt());
    }
    expect(results).toEqual([false, false, false, true, true]);
  });
});
