import { getTrustedIpFromHeaders } from '@openpanel/common/server/get-client-ip';
import { LRUCache, getRedisCache } from '@openpanel/redis';
import { TRPCError } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

/** `fastify` is not a direct dependency here, so borrow the type tRPC exposes. */
type FastifyRequest = CreateFastifyContextOptions['req'];

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
 * expiry out again. Sustained abuse therefore stays at the 24h block forever -
 * the attacker has to actually stop to climb back down.
 */
const STRIKE_TTL_MS = 24 * HOUR;

/** Past this the duration is capped anyway, so stop counting. */
const MAX_STRIKES = Math.ceil(Math.log2(BLOCK_MAX_MS / BLOCK_BASE_MS)) + 1;

/**
 * A blocked client that keeps hammering earns further strikes, but at most one
 * per cooldown. A human clicking "sign in" three more times in frustration adds
 * one strike; a bot at 5 req/s reaches the 24h cap in under ten minutes.
 */
const ESCALATION_COOLDOWN_MS = MINUTE;

export interface RateLimitOptions {
  /** Requests allowed per window before the first block. */
  max: number;
  windowMs: number;
}

/**
 * Per-process fallback used only while Redis is unreachable. Without it a Redis
 * blip would leave the sign-in endpoint completely unthrottled.
 */
const fallbackCounters = new LRUCache<string, number>({
  max: 10_000,
  ttl: 5 * MINUTE,
});

const key = (kind: string, path: string, fingerprint: string) =>
  `rl:${kind}:${path}:${fingerprint}`;

function getBlockDurationMs(strikes: number): number {
  return Math.min(BLOCK_BASE_MS * 2 ** (strikes - 1), BLOCK_MAX_MS);
}

function formatDuration(ms: number): string {
  const seconds = Math.ceil(ms / SECOND);
  if (seconds < 90) {
    return `${seconds} seconds`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 90) {
    return `${minutes} minutes`;
  }
  return `${Math.ceil(minutes / 60)} hours`;
}

/**
 * The identity we rate limit on. Deliberately ignores the client-forwarded IP
 * headers that `getClientIpFromHeaders` prefers - those are attacker-controlled
 * and would make every request its own bucket.
 */
export function getRateLimitIdentity(req: FastifyRequest) {
  const { ip, header } = getTrustedIpFromHeaders(
    req.headers,
    req.socket?.remoteAddress,
  );

  return {
    // Everything we cannot identify shares one bucket. Fail closed: an edge
    // that stops forwarding IPs should throttle, not open the gates.
    fingerprint: ip || 'unknown',
    ipHeader: header,
  };
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
async function escalate(strikeKey: string, blockKey: string, cooldownKey: string) {
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
 * IP rate limiting with exponential lockout.
 *
 * Blocks are keyed per procedure, so an office NAT that trips the sign-in limit
 * does not lose the rest of the dashboard.
 *
 * Every block is logged as `rate limit blocked` with the resolved IP so
 * repeat offenders can be pulled out of the logs and blackholed at the edge:
 *
 *   SELECT LogAttributes['ip'], count() FROM otel_logs
 *   WHERE Body = 'rate limit blocked' GROUP BY 1 ORDER BY 2 DESC
 */
export async function enforceRateLimit({
  req,
  path,
  max,
  windowMs,
}: RateLimitOptions & {
  req: FastifyRequest;
  /** tRPC procedure path - blocks are scoped to it. */
  path: string;
}): Promise<void> {
  const { fingerprint, ipHeader } = getRateLimitIdentity(req);

  const counterKey = key('count', path, fingerprint);
  const strikeKey = key('strike', path, fingerprint);
  const blockKey = key('block', path, fingerprint);
  const cooldownKey = key('cooldown', path, fingerprint);

  const log = (
    message: string,
    payload: { strikes: number; blockMs: number; hits?: number },
  ) =>
    req.log?.warn(
      {
        ip: fingerprint,
        ipHeader,
        path,
        userAgent: req.headers['user-agent'],
        strikes: payload.strikes,
        blockedForSeconds: Math.ceil(payload.blockMs / SECOND),
        blockedUntil: new Date(Date.now() + payload.blockMs).toISOString(),
        hits: payload.hits,
        max,
        windowMs,
      },
      message,
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
    blockTtlMs = Number(results?.[0]?.[1] ?? -2);
    const counterTtlMs = Number(results?.[1]?.[1] ?? -2);
    hits = Number(results?.[2]?.[1] ?? 1);

    // The window opens on the first hit. Re-arming a counter that somehow lost
    // its expiry matters too: without a TTL it would count up forever and lock
    // the IP out permanently after `max` requests.
    if (hits === 1 || counterTtlMs === -1) {
      await redis.pexpire(counterKey, windowMs);
    }
  } catch (error) {
    req.log?.error({ err: error, path }, 'rate limit store unavailable');
    const fallbackHits = (fallbackCounters.get(counterKey) ?? 0) + 1;
    fallbackCounters.set(counterKey, fallbackHits, { ttl: windowMs });
    if (fallbackHits > max) {
      throw tooManyRequests(windowMs);
    }
    return;
  }

  if (blockTtlMs > 0) {
    // Still locked out. Knocking during a block is itself abusive, so it
    // extends the lockout instead of letting it run down - but at most once per
    // cooldown, so a frustrated human cannot punish themselves the way a bot
    // hammering at full speed does.
    let escalated: { strikes: number; blockMs: number } | null = null;

    try {
      const acquired = await getRedisCache().set(
        cooldownKey,
        '1',
        'PX',
        ESCALATION_COOLDOWN_MS,
        'NX',
      );

      if (acquired) {
        escalated = await escalate(strikeKey, blockKey, cooldownKey);
      }
    } catch (error) {
      req.log?.error({ err: error, path }, 'rate limit store unavailable');
    }

    if (!escalated) {
      throw tooManyRequests(blockTtlMs);
    }

    log('rate limit blocked', escalated);
    throw tooManyRequests(escalated.blockMs);
  }

  if (hits > max) {
    let escalated: { strikes: number; blockMs: number };

    try {
      escalated = await escalate(strikeKey, blockKey, cooldownKey);
      // Start the next window clean so the block, not a stale counter, decides.
      await getRedisCache().del(counterKey);
    } catch (error) {
      req.log?.error({ err: error, path }, 'rate limit store unavailable');
      throw tooManyRequests(windowMs);
    }

    log('rate limit blocked', { ...escalated, hits });
    throw tooManyRequests(escalated.blockMs);
  }
}

export const __testing = {
  BLOCK_BASE_MS,
  BLOCK_MAX_MS,
  MAX_STRIKES,
  ESCALATION_COOLDOWN_MS,
  getBlockDurationMs,
  formatDuration,
};
