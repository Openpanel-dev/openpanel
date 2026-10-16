// The HTTP limiter: a fixed window with no escalation, matching the published
// rate-limit docs.

import { getRedisCache } from '@openpanel/redis';
import { Elysia } from 'elysia';
import type { AppDeps } from '../context';
import type { Logger } from '../logger';
import { getTrustedIpFromHeaders } from '../shared/get-client-ip';
import { requestContext } from './context';

const TOO_MANY_REQUESTS = 429;
const KEY_MISSING = -2;
const KEY_WITHOUT_EXPIRY = -1;

/** Exact response body the rate-limit docs publish. */
const TOO_MANY_REQUESTS_BODY = {
  statusCode: TOO_MANY_REQUESTS,
  error: 'Too Many Requests',
  message: 'You have exceeded the rate limit for this endpoint.',
} as const;

/**
 * The API client if there is one, otherwise the TRUSTED ip.
 * `x-client-ip` and `x-forwarded-for` are caller-set, so keying on the
 * attribution address would hand out a fresh bucket per request.
 */
const TRUSTED_ONLY = { attributionOrder: undefined, trustedOrder: undefined };

function fingerprintFor(headers: Headers, remoteAddress?: string): string {
  const clientId = headers.get('openpanel-client-id');
  if (clientId) {
    return `client:${clientId}`;
  }
  const { ip } = getTrustedIpFromHeaders(TRUSTED_ONLY, headers, remoteAddress);
  // Fail closed: an edge that stops forwarding IPs should throttle, not open.
  return `ip:${ip || 'unknown'}`;
}

export interface HttpRateLimit {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
  /** Groups every route under one bucket. */
  scope: string;
}

/**
 * `true` when the caller is over its limit and the request must be refused.
 * A Redis failure allows the request: this guards a documented quota, not a
 * credential.
 */
export async function isRateLimited(
  { max, windowMs, scope }: HttpRateLimit,
  headers: Headers,
  remoteAddress: string | undefined,
  logger: Logger
): Promise<boolean> {
  const key = `rl:http:${scope}:${fingerprintFor(headers, remoteAddress)}`;

  try {
    const redis = getRedisCache();
    const results = await redis.pipeline().incr(key).pttl(key).exec();
    const hits = Number(results?.[0]?.[1] ?? 1);
    const ttlMs = Number(results?.[1]?.[1] ?? KEY_MISSING);

    // The window opens on the first hit. Re-arm a counter that lost its
    // expiry, or it would count up forever and lock the caller out for good.
    if (hits === 1 || ttlMs === KEY_WITHOUT_EXPIRY || ttlMs === KEY_MISSING) {
      await redis.pexpire(key, windowMs);
    }

    if (hits > max) {
      logger.warn({ scope, key, hits, max, windowMs }, 'rate limit exceeded');
      return true;
    }
    return false;
  } catch (error) {
    logger.error({ err: error, scope }, 'rate limit store unavailable');
    return false;
  }
}

/**
 * The first matching prefix wins. `/export`, `/insights` and `/manage` are the
 * published limits; `/track`, `/profile` and `/import` are absent on purpose:
 * the docs promise they are unlimited.
 */
export const HTTP_RATE_LIMITS: readonly (HttpRateLimit & {
  prefix: string;
})[] = [
  { prefix: '/manage', scope: 'manage', max: 20, windowMs: 10_000 },
  { prefix: '/export', scope: 'export', max: 100, windowMs: 10_000 },
  { prefix: '/insights', scope: 'insights', max: 100, windowMs: 10_000 },
  { prefix: '/mcp', scope: 'mcp', max: 60, windowMs: 60_000 },
];

export function limitFor(pathname: string): HttpRateLimit | undefined {
  return HTTP_RATE_LIMITS.find((limit) => pathname.startsWith(limit.prefix));
}

/** Mounted once per route surface so a new `/manage` route cannot arrive without a limit. */
export function httpRateLimit(deps: AppDeps) {
  return new Elysia({ name: 'core/http/rate-limit' })
    .use(requestContext(deps))
    .onBeforeHandle({ as: 'global' }, async ({ ctx, request, path, set }) => {
      const limit = limitFor(path);
      if (!limit) {
        return;
      }
      // `ctx` is absent for a request that matched no route, and an unmatched
      // path deserves its 404 rather than a quota.
      if (!ctx) {
        return;
      }
      // No socket address at this layer; without a trusted header, callers
      // share the fail-closed `unknown` bucket.
      const limited = await isRateLimited(
        limit,
        request.headers,
        undefined,
        ctx.logger
      );
      if (limited) {
        set.status = TOO_MANY_REQUESTS;
        return TOO_MANY_REQUESTS_BODY;
      }
    });
}

export { TOO_MANY_REQUESTS, TOO_MANY_REQUESTS_BODY };
