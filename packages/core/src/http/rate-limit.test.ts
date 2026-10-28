// The prefix table IS the contract: it must match the published rate limits,
// and the paths the docs call unlimited must stay absent from it.

import { describe, expect, test } from 'bun:test';
import { fingerprintFor, HTTP_RATE_LIMITS, limitFor } from './rate-limit';

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
    expect(fingerprintFor('ip', request)).toBe('ip:unknown');
  });

  test('MCP buckets on the token, not on a rotated header', () => {
    const request = new Request(`https://api.test/mcp?token=${mcpToken}`, {
      headers: { 'openpanel-client-id': ROTATED_ID },
    });
    expect(fingerprintFor('mcp-token', request)).toBe(`client:${CLIENT_ID}`);

    const bearer = new Request('https://api.test/mcp', {
      headers: { authorization: `Bearer ${mcpToken}` },
    });
    expect(fingerprintFor('mcp-token', bearer)).toBe(`client:${CLIENT_ID}`);
  });

  test('authenticated surfaces bucket on the client they authenticate', () => {
    const request = new Request('https://api.test/export/events', {
      headers: { 'openpanel-client-id': CLIENT_ID },
    });
    expect(fingerprintFor('client', request)).toBe(`client:${CLIENT_ID}`);
  });
});
