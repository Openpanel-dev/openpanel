/**
 * Tests for requestLoggingHook.
 *
 * The behaviour guarded here: the logged payload never carries a query-string
 * credential. The tRPC branch drops the query entirely; every other request
 * goes through sanitizeUrl.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { requestLoggingHook } from './request-logging.hook';

const SECRET = 'c3VwZXItc2VjcmV0LXRva2Vu';

function makeReq(url: string, overrides: Partial<FastifyRequest> = {}) {
  const info = vi.fn();
  const request = {
    url,
    method: 'GET',
    headers: {},
    log: { info },
    ...overrides,
  } as unknown as FastifyRequest;
  return { request, info };
}

const reply = { elapsedTime: 12 } as unknown as FastifyReply;

describe('requestLoggingHook', () => {
  it('does not log the value of a sensitive query parameter', async () => {
    const { request, info } = makeReq(`/mcp?token=${SECRET}&projectId=p1`);

    await requestLoggingHook(request, reply);

    expect(info).toHaveBeenCalledTimes(1);
    const payload = info.mock.calls[0]?.[0];
    expect(JSON.stringify(payload)).not.toContain(SECRET);
    expect(payload.url).toBe('/mcp?token=[REDACTED]&projectId=p1');
  });

  it('logs the bare path for tRPC requests', async () => {
    const { request, info } = makeReq(`/trpc/report.get?token=${SECRET}`);

    await requestLoggingHook(request, reply);

    const payload = info.mock.calls[0]?.[0];
    expect(payload.url).toBe('/trpc/report.get');
    expect(JSON.stringify(payload)).not.toContain(SECRET);
  });

  it('still recognises /track by path when the query is filtered', async () => {
    const { request, info } = makeReq(`/track?token=${SECRET}`, {
      body: { type: 'track' },
    } as Partial<FastifyRequest>);

    await requestLoggingHook(request, reply);

    const payload = info.mock.calls[0]?.[0];
    expect(payload.body).toEqual({ type: 'track' });
    expect(payload.url).toBe('/track?token=[REDACTED]');
  });
});
