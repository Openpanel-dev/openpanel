import { getSuperJson, setSuperJson } from '@openpanel/json';
import type { RedisOptions } from 'ioredis';
import { Redis } from 'ioredis';

const options: RedisOptions = {
  connectTimeout: 10000,
};

export { Redis };

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Dedicated URLs for high-traffic buffers. Fall back to REDIS_URL if not set.
const REDIS_SESSION_URL = process.env.REDIS_SESSION_URL || REDIS_URL;
const REDIS_EVENT_URL = process.env.REDIS_EVENT_URL || REDIS_URL;

export interface ExtendedRedis extends Redis {
  getJson: <T = any>(key: string) => Promise<T | null>;
  setJson: <T = any>(
    key: string,
    expireInSec: number,
    value: T,
  ) => Promise<void>;
}

const createRedisClient = (
  url: string,
  overrides: RedisOptions = {},
): ExtendedRedis => {
  const client = new Redis(url, {
    ...options,
    ...overrides,
  }) as ExtendedRedis;

  client.on('error', (error) => {
    console.error('Redis Client Error:', error);
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
    redisCache = createRedisClient(REDIS_URL, options);
  }

  return redisCache;
}

let redisSub: ExtendedRedis;
export function getRedisSub() {
  if (!redisSub) {
    redisSub = createRedisClient(REDIS_URL, options);
  }

  return redisSub;
}

let redisPub: ExtendedRedis;
export function getRedisPub() {
  if (!redisPub) {
    redisPub = createRedisClient(REDIS_URL, options);
  }

  return redisPub;
}

let redisQueue: ExtendedRedis;
export function getRedisQueue() {
  if (!redisQueue) {
    // Use different redis for queues (self-hosting will re-use the same redis instance)
    redisQueue = createRedisClient(REDIS_URL, {
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
    // Dedicated Redis connection for GroupWorker to avoid blocking BullMQ.
    // Uses REDIS_EVENT_URL so GroupMQ and EventBuffer share the same instance.
    redisGroupQueue = createRedisClient(REDIS_EVENT_URL, {
      ...options,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
    });
  }

  return redisGroupQueue;
}

let redisSession: ExtendedRedis;
export function getRedisSession() {
  if (!redisSession) {
    redisSession = createRedisClient(REDIS_SESSION_URL, options);
  }
  return redisSession;
}

let redisEvent: ExtendedRedis;
export function getRedisEvent() {
  if (!redisEvent) {
    redisEvent = createRedisClient(REDIS_EVENT_URL, options);
  }
  return redisEvent;
}

export async function getLock(key: string, value: string, timeout: number) {
  const lock = await getRedisCache().set(key, value, 'PX', timeout, 'NX');
  return lock === 'OK';
}
