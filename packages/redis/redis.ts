import { getSuperJson, setSuperJson } from '@openpanel/json';
import type { RedisOptions } from 'ioredis';
import { Redis } from 'ioredis';

// Per-command timeout. ioredis has no per-command timeout by default — if
// the TCP connection goes half-dead (kernel says "alive" but no ACKs come
// back), commands queue forever and any caller awaiting a Redis op wedges
// indefinitely. With this set, a single command rejects after 30s and the
// caller can re-queue / retry. Mirrors the order of magnitude of
// CLICKHOUSE_REQUEST_TIMEOUT_MS so failures across the two systems
// propagate consistently.
const COMMAND_TIMEOUT_MS = process.env.REDIS_COMMAND_TIMEOUT_MS
  ? Math.max(1000, Number.parseInt(process.env.REDIS_COMMAND_TIMEOUT_MS, 10))
  : 30000;

const options: RedisOptions = {
  connectTimeout: 10000,
  commandTimeout: COMMAND_TIMEOUT_MS,
};

export { Redis };

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export interface ExtendedRedis extends Redis {
  getJson: <T = any>(key: string) => Promise<T | null>;
  setJson: <T = any>(
    key: string,
    expireInSec: number,
    value: T,
  ) => Promise<void>;
}

const createRedisClient = (
  name: string,
  url: string,
  overrides: RedisOptions = {},
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
    value: T,
  ): Promise<void> => {
    await client.setex(key, expireInSec, setSuperJson(value));
  };

  return client;
};

let redisCache: ExtendedRedis;
export function getRedisCache() {
  if (!redisCache) {
    redisCache = createRedisClient('redis-cache', REDIS_URL, options);
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
    redisQueue = createRedisClient('redis-queue', REDIS_URL, {
      ...options,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
    });
  }

  return redisQueue;
}

let redisGroupQueue: ExtendedRedis;
export function getRedisGroupQueue() {
  if (!redisGroupQueue) {
    // Dedicated Redis connection for GroupWorker to avoid blocking BullMQ
    redisGroupQueue = createRedisClient('redis-group-queue', REDIS_URL, {
      ...options,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
    });
  }

  return redisGroupQueue;
}

export async function getLock(key: string, value: string, timeout: number) {
  const lock = await getRedisCache().set(key, value, 'PX', timeout, 'NX');
  return lock === 'OK';
}
