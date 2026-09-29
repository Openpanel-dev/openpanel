// The prefix table IS the contract: it has to match what
// docs/api-reference/rate-limits.mdx publishes, and the paths that page calls
// unlimited must stay absent from it (ISSUES.md H4).

import { describe, expect, test } from 'bun:test';
import { HTTP_RATE_LIMITS, limitFor } from './rate-limit';

// The published rate-limits page's numbers, for the first three entries;
// `/mcp` is pinned here only.
const V1_LIMITS = {
  '/manage/clients': { max: 20, windowMs: 10_000 },
  '/export/events': { max: 100, windowMs: 10_000 },
  '/insights/acme-web/overview': { max: 100, windowMs: 10_000 },
  '/mcp': { max: 60, windowMs: 60_000 },
} as const;

describe('HTTP rate limits', () => {
  test("each documented surface keeps V1's numbers", () => {
    for (const [path, expected] of Object.entries(V1_LIMITS)) {
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
});
