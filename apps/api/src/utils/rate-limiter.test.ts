/**
 * Tests for the rate limiter's onExceeded log line — it records the request
 * URL, which on some routes carries a credential in the query string.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@openpanel/redis', () => ({ getRedisCache: vi.fn() }));

const { activateRateLimiter } = await import('./rate-limiter');

const SECRET = 'c3VwZXItc2VjcmV0LXRva2Vu';

async function captureOptions() {
  const register = vi.fn();
  await activateRateLimiter({
    fastify: { register } as never,
    max: 10,
  });
  return register.mock.calls[0]?.[1] as {
    onExceeded: (req: unknown) => void;
  };
}

describe('activateRateLimiter', () => {
  it('does not log the value of a sensitive query parameter', async () => {
    const options = await captureOptions();
    const warn = vi.fn();

    options.onExceeded({
      headers: { 'openpanel-client-id': 'client-1' },
      socket: { remoteAddress: '127.0.0.1' },
      url: `/mcp?token=${SECRET}&projectId=p1`,
      log: { warn },
    });

    const payload = warn.mock.calls[0]?.[0];
    expect(JSON.stringify(payload)).not.toContain(SECRET);
    expect(payload.url).toBe('/mcp?token=[REDACTED]&projectId=p1');
  });
});
