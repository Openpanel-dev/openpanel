// IP rate limiting with an exponentially growing lockout, ported from
// packages/trpc/src/rate-limit.ts (V1). The rewrite already carried the seam
// — `EnforceRateLimit` and `createRateLimitMiddleware` in rpc/base.ts — but
// nothing implemented it, so the ten wrappers V1 had on its auth router were
// not mounted and no limit existed anywhere (ISSUES.md H4).
//
// The one structural change from V1: the enforcer takes headers, the socket
// address and a logger rather than a FastifyRequest, which is what lets a
// procedure be tested without a server.

import { getRedisCache, LRUCache } from '@openpanel/redis';
import { TRPCError } from '@trpc/server';
import { getTrustedIpFromHeaders } from '../shared/get-client-ip';
import type { EnforceRateLimit } from './base';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/**
 * The block handed out the first time a fingerprint blows through its window.
 * It doubles on every further strike, so a client that keeps knocking walks
 * 5m -> 10m -> 20m -> ... -> BLOCK_MAX_MS.
 */
const BLOCK_BASE_MS = 5 * MINUTE;
const BLOCK_MAX_MS = 24 * HOUR;

/**
 * Strikes only decay after a full quiet day, and every new strike pushes the
 * expiry out again. Sustained abuse therefore stays at the 24h block: the
 * attacker has to actually stop to climb back down.
 */
const STRIKE_TTL_MS = 24 * HOUR;

/** Past this the duration is capped anyway, so stop counting. */
const MAX_STRIKES = Math.ceil(Math.log2(BLOCK_MAX_MS / BLOCK_BASE_MS)) + 1;

/**
 * A blocked client that keeps hammering earns further strikes, but at most one
 * per cooldown. A human clicking "sign in" three more times in frustration
 * adds one strike; a bot at 5 req/s reaches the 24h cap in under ten minutes.
 */
const ESCALATION_COOLDOWN_MS = MINUTE;

const SECONDS_IN_MINUTE = 60;
const READABLE_SECONDS_LIMIT = 90;
const READABLE_MINUTES_LIMIT = 90;
const FALLBACK_CACHE_MAX = 10_000;
const KEY_MISSING = -2;
const KEY_WITHOUT_EXPIRY = -1;

/**
 * Per-process fallback used only while Redis is unreachable. Without it a
 * Redis blip would leave sign-in completely unthrottled.
 */
const fallbackCounters = new LRUCache<string, number>({
  max: FALLBACK_CACHE_MAX,
  ttl: 5 * MINUTE,
});

/**
 * The trusted-header defaults. A limiter must never key on the ATTRIBUTION
 * address: that one prefers client-forwarded headers, so every request would
 * get its own bucket (ADR-002 preserved-behaviour 2).
 */
const TRUSTED_ONLY = { attributionOrder: undefined, trustedOrder: undefined };

const keyFor = (kind: string, path: string, fingerprint: string) =>
  `rl:${kind}:${path}:${fingerprint}`;

function getBlockDurationMs(strikes: number): number {
  return Math.min(BLOCK_BASE_MS * 2 ** (strikes - 1), BLOCK_MAX_MS);
}

function formatDuration(ms: number): string {
  const seconds = Math.ceil(ms / SECOND);
  if (seconds < READABLE_SECONDS_LIMIT) {
    return `${seconds} seconds`;
  }
  const minutes = Math.ceil(seconds / SECONDS_IN_MINUTE);
  if (minutes < READABLE_MINUTES_LIMIT) {
    return `${minutes} minutes`;
  }
  return `${Math.ceil(minutes / SECONDS_IN_MINUTE)} hours`;
}

function tooManyRequests(blockMs: number): TRPCError {
  return new TRPCError({
    code: 'TOO_MANY_REQUESTS',
    message: `Too many requests. Try again in ${formatDuration(blockMs)}.`,
  });
}

/**
 * Record a strike and (re)arm the block. Returns the new strike count and how
 * long the client is locked out for.
 */
async function escalate(
  strikeKey: string,
  blockKey: string,
  cooldownKey: string
): Promise<{ strikes: number; blockMs: number }> {
  const redis = getRedisCache();

  // Counter and its expiry go out together: a strike key that lost its TTL
  // would keep an IP at the maximum lockout forever.
  const results = await redis
    .pipeline()
    .incr(strikeKey)
    .pexpire(strikeKey, STRIKE_TTL_MS)
    .exec();

  const strikes = Math.min(Number(results?.[0]?.[1] ?? 1), MAX_STRIKES);
  const blockMs = getBlockDurationMs(strikes);

  await redis
    .pipeline()
    .set(blockKey, String(strikes), 'PX', blockMs)
    .set(cooldownKey, '1', 'PX', ESCALATION_COOLDOWN_MS)
    .exec();

  return { strikes, blockMs };
}

/**
 * Blocks are keyed per procedure, so an office NAT that trips the sign-in
 * limit does not lose the rest of the dashboard.
 *
 * Every block is logged as `rate limit blocked` with the resolved IP, so
 * repeat offenders can be pulled out of the logs and blackholed at the edge.
 */
export const enforceRateLimit: EnforceRateLimit = async ({
  headers,
  remoteAddress,
  logger,
  path,
  max,
  windowMs,
}) => {
  const { ip: trustedIp, header: ipHeader } = getTrustedIpFromHeaders(
    TRUSTED_ONLY,
    headers,
    remoteAddress
  );
  // Everything we cannot identify shares one bucket. Fail closed: an edge that
  // stops forwarding IPs should throttle, not open the gates.
  const fingerprint = trustedIp || 'unknown';

  const counterKey = keyFor('count', path, fingerprint);
  const strikeKey = keyFor('strike', path, fingerprint);
  const blockKey = keyFor('block', path, fingerprint);
  const cooldownKey = keyFor('cooldown', path, fingerprint);

  const logBlocked = (payload: {
    strikes: number;
    blockMs: number;
    hits?: number;
  }) =>
    logger.warn(
      {
        ip: fingerprint,
        ipHeader,
        path,
        userAgent: headers.get('user-agent') ?? undefined,
        strikes: payload.strikes,
        blockedForSeconds: Math.ceil(payload.blockMs / SECOND),
        blockedUntil: new Date(Date.now() + payload.blockMs).toISOString(),
        hits: payload.hits,
        max,
        windowMs,
      },
      'rate limit blocked'
    );

  let blockTtlMs: number;
  let hits: number;

  try {
    const redis = getRedisCache();
    const results = await redis
      .pipeline()
      .pttl(blockKey)
      .pttl(counterKey)
      .incr(counterKey)
      .exec();

    // `pttl` returns -2 when the key is gone and -1 when it has no expiry.
    blockTtlMs = Number(results?.[0]?.[1] ?? KEY_MISSING);
    const counterTtlMs = Number(results?.[1]?.[1] ?? KEY_MISSING);
    hits = Number(results?.[2]?.[1] ?? 1);

    // The window opens on the first hit. Re-arming a counter that somehow lost
    // its expiry matters too: with no TTL it would count up forever and lock
    // the IP out permanently after `max` requests.
    if (hits === 1 || counterTtlMs === KEY_WITHOUT_EXPIRY) {
      await redis.pexpire(counterKey, windowMs);
    }
  } catch (error) {
    logger.error({ err: error, path }, 'rate limit store unavailable');
    const fallbackHits = (fallbackCounters.get(counterKey) ?? 0) + 1;
    fallbackCounters.set(counterKey, fallbackHits, { ttl: windowMs });
    if (fallbackHits > max) {
      throw tooManyRequests(windowMs);
    }
    return;
  }

  if (blockTtlMs > 0) {
    // Still locked out. Knocking during a block is itself abusive, so it
    // extends the lockout instead of letting it run down — but at most once
    // per cooldown, so a frustrated human cannot punish themselves the way a
    // bot hammering at full speed does.
    let escalated: { strikes: number; blockMs: number } | null = null;

    try {
      const acquired = await getRedisCache().set(
        cooldownKey,
        '1',
        'PX',
        ESCALATION_COOLDOWN_MS,
        'NX'
      );
      if (acquired) {
        escalated = await escalate(strikeKey, blockKey, cooldownKey);
      }
    } catch (error) {
      logger.error({ err: error, path }, 'rate limit store unavailable');
    }

    if (!escalated) {
      throw tooManyRequests(blockTtlMs);
    }

    logBlocked(escalated);
    throw tooManyRequests(escalated.blockMs);
  }

  if (hits > max) {
    let escalated: { strikes: number; blockMs: number };

    try {
      escalated = await escalate(strikeKey, blockKey, cooldownKey);
      // Start the next window clean so the block, not a stale counter, decides.
      await getRedisCache().del(counterKey);
    } catch (error) {
      logger.error({ err: error, path }, 'rate limit store unavailable');
      throw tooManyRequests(windowMs);
    }

    logBlocked({ ...escalated, hits });
    throw tooManyRequests(escalated.blockMs);
  }
};

export const __testing = {
  BLOCK_BASE_MS,
  BLOCK_MAX_MS,
  MAX_STRIKES,
  ESCALATION_COOLDOWN_MS,
  getBlockDurationMs,
  formatDuration,
};
