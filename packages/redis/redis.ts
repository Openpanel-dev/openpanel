import { getSuperJson, setSuperJson } from '@openpanel/shared';
import type { RedisOptions } from 'ioredis';
import { Redis } from 'ioredis';

const options: RedisOptions = {
  connectTimeout: 10_000,
};

/**
 * The cache client's tail bound, for the fault the offline queue cannot see: a server whose socket is UP and which
 * answers nothing. It has to clear the heaviest legitimate command by a wide margin, or a busy event-buffer flush
 * would fail as if Redis were down and refuse to commit Kafka offsets. 500 ms is roughly 15x the measured p99 of
 * that flush's worst case (`apps/api/e2e/redis-command-cost.ts`). Full numbers: `apps/api/e2e/redis-fail-fast.md`.
 */
export const CACHE_COMMAND_TIMEOUT_MS = 500;

/**
 * Fail-fast makes the RECONNECT BACKOFF user-visible. While ioredis is waiting
 * out its next attempt every command is rejected instead of queued, so the
 * backoff is a window of hard failures that lasts past the moment Redis comes
 * back, and it grows with the length of the outage — ioredis's default is
 * `min(attempt * 50, 2000)` ms and the attempt counter never resets while the
 * server is away. This tighter cap keeps that recovery window well under a
 * second even after a long outage (measured in `apps/api/e2e/redis-fail-fast.ts`,
 * phase C).
 */
const CACHE_RECONNECT_DELAY_STEP_MS = 50;
const CACHE_RECONNECT_MAX_DELAY_MS = 500;

/**
 * BullMQ mandates `maxRetriesPerRequest: null` and an offline queue: a blocking
 * BRPOPLPUSH must not be given up on, and a queued job must not be dropped
 * because the socket blinked. The cache client fails fast; this one
 * deliberately does not.
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
 * The CACHE client fails fast: on ioredis's defaults a command issued while Redis is down waits out the reconnect
 * backoff, which measured as multi-second `/track` blocking. Everything on the ingest path treats these reads as
 * optional, so that wait bought nothing.
 *
 * Two mechanisms: the offline queue is turned off once connected (a command on a known-down socket is rejected in
 * microseconds), and `commandTimeout` bounds the case where the socket is up and the server answers nothing.
 * `commandTimeout` alone is not enough: ioredis arms the deadline before the writable check. Numbers:
 * `apps/api/e2e/redis-fail-fast.md`.
 *
 * The offline queue stays on until the first connect: with it off, ioredis rejects every command issued before the
 * first connect completes, so boot order would decide whether a command works.
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
