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
 * `x-client-ip` and `x-forwarded-for` are caller-set, so keying on the
 * attribution address would hand out a fresh bucket per request.
 */
const TRUSTED_ONLY = { attributionOrder: undefined, trustedOrder: undefined };
const MCP_TOKEN_SEPARATOR = ':';

/**
 * Who a bucket belongs to. The limiter runs before authentication, so a
 * caller-supplied id only names the bucket where it also names the credential
 * that request is checked against:
 * - `client`: the `openpanel-client-id` header the route authenticates.
 * - `mcp-token`: the client id inside the MCP token, which MCP authenticates;
 *   its callers share egress addresses (hosted AI clients), so not the ip.
 * - `ip`: an unauthenticated route, where any header is free to rotate.
 */
export type RateLimitKey = 'client' | 'mcp-token' | 'ip';

function mcpTokenClientId(request: Request): string | undefined {
  const token =
    new URL(request.url).searchParams.get('token') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return undefined;
  }
  const decoded = Buffer.from(token, 'base64').toString('utf-8');
  const separator = decoded.indexOf(MCP_TOKEN_SEPARATOR);
  return separator > 0 ? decoded.slice(0, separator) : undefined;
}

function callerIdFor(
  keyBy: RateLimitKey,
  request: Request
): string | undefined {
  if (keyBy === 'client') {
    return request.headers.get('openpanel-client-id') ?? undefined;
  }
  if (keyBy === 'mcp-token') {
    return mcpTokenClientId(request);
  }
  return undefined;
}

export function fingerprintFor(
  keyBy: RateLimitKey,
  request: Request,
  remoteAddress?: string
): string {
  const clientId = callerIdFor(keyBy, request);
  if (clientId) {
    return `client:${clientId}`;
  }
  const { ip } = getTrustedIpFromHeaders(
    TRUSTED_ONLY,
    request.headers,
    remoteAddress
  );
  // Fail closed: an edge that stops forwarding IPs should throttle, not open.
  return `ip:${ip || 'unknown'}`;
}

export interface HttpRateLimit {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
  /** Groups every route under one bucket. */
  scope: string;
  keyBy: RateLimitKey;
}

/**
 * `true` when the caller is over its limit and the request must be refused.
 * A Redis failure allows the request: this guards a documented quota, not a
 * credential.
 */
export async function isRateLimited(
  { max, windowMs, scope, keyBy }: HttpRateLimit,
  request: Request,
  remoteAddress: string | undefined,
  logger: Logger
): Promise<boolean> {
  const key = `rl:http:${scope}:${fingerprintFor(keyBy, request, remoteAddress)}`;

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
 * the docs promise they are unlimited. `/misc/favicon` asks third-party icon
 * services on the caller's behalf, and one dashboard page loads a few dozen
 * icons at once.
 */
export const HTTP_RATE_LIMITS: readonly (HttpRateLimit & {
  prefix: string;
})[] = [
  {
    prefix: '/manage',
    scope: 'manage',
    keyBy: 'client',
    max: 20,
    windowMs: 10_000,
  },
  {
    prefix: '/export',
    scope: 'export',
    keyBy: 'client',
    max: 100,
    windowMs: 10_000,
  },
  {
    prefix: '/insights',
    scope: 'insights',
    keyBy: 'client',
    max: 100,
    windowMs: 10_000,
  },
  {
    prefix: '/mcp',
    scope: 'mcp',
    keyBy: 'mcp-token',
    max: 60,
    windowMs: 60_000,
  },
  {
    prefix: '/misc/favicon',
    scope: 'favicon',
    keyBy: 'ip',
    max: 100,
    windowMs: 10_000,
  },
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
        request,
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
