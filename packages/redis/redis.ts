import { getSuperJson, setSuperJson } from '@openpanel/shared';
import type { RedisOptions } from 'ioredis';
import { Redis } from 'ioredis';

const options: RedisOptions = {
  connectTimeout: 10_000,
};

/**
 * The cache client's tail bound, for the fault the offline queue cannot see:
 * a server whose socket is UP and which answers nothing (a frozen or
 * partitioned node). Nothing else in the request path sets a deadline there —
 * `/track` never answered inside 30 s in that fault before this.
 *
 * It has to clear the heaviest LEGITIMATE command by a wide margin, or a busy
 * event-buffer flush would start failing as if Redis were down — and under
 * M18-001 a failed flush refuses to commit Kafka offsets. Measured on this box
 * (`apps/api/e2e/redis-command-cost.ts`): the event buffer's worst case, a
 * MULTI of 4,000 rpush (~4 MB), p99 33.95 ms; `LRANGE 0..3999` p99 21.26 ms;
 * `GET` p99 0.18 ms. 500 ms is ~15x the worst of those.
 *
 * Every number behind this file: `apps/api/e2e/redis-fail-fast.md`.
 */
export const CACHE_COMMAND_TIMEOUT_MS = 500;

/**
 * Fail-fast makes the RECONNECT BACKOFF user-visible. While ioredis is waiting
 * out its next attempt every command is rejected instead of queued, so the
 * backoff is a window of hard failures that lasts past the moment Redis comes
 * back, and it grows with the length of the outage — ioredis's default is
 * `min(attempt * 50, 2000)` ms and the attempt counter never resets while the
 * server is away. Time from "Redis is back" to "`/track` answers 200 again"
 * (`apps/api/e2e/redis-fail-fast.ts`, phase C): after a 20 s outage 390/395/396
 * ms on the default cap vs 349/340/342 ms on this one, after a 60 s outage
 * 1,137/1,135 ms vs 416/413 ms.
 */
const CACHE_RECONNECT_DELAY_STEP_MS = 50;
const CACHE_RECONNECT_MAX_DELAY_MS = 500;

/**
 * BullMQ mandates `maxRetriesPerRequest: null` and an offline queue: a blocking
 * BRPOPLPUSH must not be given up on, and a queued job must not be dropped
 * because the socket blinked. M18-003 made the CACHE client fail fast and
 * deliberately left this alone (Carl, 2026-09-13: "for cache we should have
 * fail fast, for queue I think we should have the settings we have already").
 */
export const QUEUE_CLIENT_OPTIONS: RedisOptions = {
  ...options,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
};

export { Redis };

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:23379';

export interface ExtendedRedis extends Redis {
  getJson: <T = any>(key: string) => Promise<T | null>;
  setJson: <T = any>(
    key: string,
    expireInSec: number,
    value: T
  ) => Promise<void>;
}

const createRedisClient = (
  name: string,
  url: string,
  overrides: RedisOptions = {}
): ExtendedRedis => {
  const client = new Redis(url, {
    ...options,
    ...overrides,
  }) as ExtendedRedis;

  client.on('error', (error) => {
    console.error(`[${name}] Redis Client Error:`, error);
  });

  client.getJson = async <T = any>(key: string): Promise<T | null> => {
    const value = await client.get(key);
    if (value) {
      const res = getSuperJson(value) as T;
      if (res && Array.isArray(res) && res.length === 0) {
        return null;
      }

      if (res && typeof res === 'object' && Object.keys(res).length === 0) {
        return null;
      }

      if (res) {
        return res;
      }
    }
    return null;
  };

  client.setJson = async <T = any>(
    key: string,
    expireInSec: number,
    value: T
  ): Promise<void> => {
    await client.setex(key, expireInSec, setSuperJson(value));
  };

  return client;
};

/**
 * The CACHE client fails fast (M18-003). Drill 02 measured `/track` blocking
 * 9,427 / 12,039 / 41,978 ms on a stopped Redis, and 10 of 20 requests getting
 * no answer inside 30 s, because on ioredis's defaults the command is QUEUED
 * and waits out 20 reconnect attempts (backoff `min(times * 50, 2000)` ms)
 * before `MaxRetriesPerRequestError`. Everything on the ingest path already
 * treats these reads as optional — `device-id.ts` catches the session-buffer
 * failure and mints the deterministic session id — so the wait bought nothing
 * but a slower failure.
 *
 * Two mechanisms, because there are two faults:
 *
 *  - **The offline queue goes off**, so a command issued while the socket is
 *    known-down is rejected in microseconds rather than queued. This is what
 *    keeps a warm-cache `/track` at its normal latency during an outage.
 *  - **`commandTimeout`** bounds the case the offline queue cannot see, where
 *    the socket is up and the server answers nothing.
 *
 * Reproduced and measured before/after on this box, with the API pointed at a
 * TCP proxy that can stop or freeze: with Redis stopped, a warm-auth `/track`
 * goes from 2-of-3 requests never answered inside 30 s to 200 × 10 at p50
 * 10.0 ms, and a cold-auth one from the same 30 s hang to 500 at p50 1.3 ms.
 * `commandTimeout` on its own, with the queue left on, was measured as well and
 * is not enough: it bounds the tail but leaves that warm `/track` at 1,011 ms,
 * because ioredis arms the deadline before the writable check, so the queued
 * command pays it in full. The cost of going further, and why the deadline is
 * 500 ms: `apps/api/e2e/redis-fail-fast.md`.
 *
 * THE OFFLINE QUEUE STAYS ON UNTIL THE CLIENT HAS CONNECTED ONCE. ioredis
 * rejects every command issued before the first connect completes when the
 * queue is off — including the ones a process issues while it is still
 * booting — which would make boot order decide whether a command works. A
 * process that has never reached Redis therefore still falls back to
 * `commandTimeout`, which is bounded; one that has connected fails instantly.
 */
export function createFailFastCacheClient(
  name: string,
  url: string
): ExtendedRedis {
  const client = createRedisClient(name, url, {
    ...options,
    commandTimeout: CACHE_COMMAND_TIMEOUT_MS,
    retryStrategy: (attempt) =>
      Math.min(
        attempt * CACHE_RECONNECT_DELAY_STEP_MS,
        CACHE_RECONNECT_MAX_DELAY_MS
      ),
  });
  client.once('ready', () => {
    client.options.enableOfflineQueue = false;
  });
  return client;
}

let redisCache: ExtendedRedis;
export function getRedisCache() {
  if (!redisCache) {
    redisCache = createFailFastCacheClient('redis-cache', REDIS_URL);
  }

  return redisCache;
}

let redisSub: ExtendedRedis;
export function getRedisSub() {
  if (!redisSub) {
    redisSub = createRedisClient('redis-sub', REDIS_URL, {
      ...options,
      // Disable ready check for subscription client since it uses INFO command
      // which is not allowed once the client enters subscription mode
      enableReadyCheck: false,
    });
  }

  return redisSub;
}

let redisPub: ExtendedRedis;
export function getRedisPub() {
  if (!redisPub) {
    redisPub = createRedisClient('redis-pub', REDIS_URL, options);
  }

  return redisPub;
}

let redisQueue: ExtendedRedis;
export function getRedisQueue() {
  if (!redisQueue) {
    // Use different redis for queues (self-hosting will re-use the same redis instance)
    redisQueue = createRedisClient(
      'redis-queue',
      REDIS_URL,
      QUEUE_CLIENT_OPTIONS
    );
  }

  return redisQueue;
}

export async function getLock(key: string, value: string, timeout: number) {
  const lock = await getRedisCache().set(key, value, 'PX', timeout, 'NX');
  return lock === 'OK';
}
