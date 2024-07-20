import type { RedisOptions } from 'ioredis';
import Redis from 'ioredis';

const options: RedisOptions = {
  connectTimeout: 10000,
};

export { Redis };

const createRedisClient = (
  url: string,
  overrides: RedisOptions = {}
): Redis => {
  const client = new Redis(url, { ...options, ...overrides });

  client.on('error', (error) => {
    console.error('Redis Client Error:', error);
  });

  return client;
};

let redisCache: Redis;
export function getRedisCache() {
  if (!redisCache) {
    redisCache = createRedisClient(process.env.REDIS_URL!, options);
  }

  return redisCache;
}

let redisSub: Redis;
export function getRedisSub() {
  if (!redisSub) {
    redisSub = createRedisClient(process.env.REDIS_URL!, options);
  }

  return redisSub;
}

let redisPub: Redis;
export function getRedisPub() {
  if (!redisPub) {
    redisPub = createRedisClient(process.env.REDIS_URL!, options);
  }

  return redisPub;
}

let redisQueue: Redis;
export function getRedisQueue() {
  if (!redisQueue) {
    // Use different redis for queues (self-hosting will re-use the same redis instance)
    redisQueue = createRedisClient(
      (process.env.QUEUE_REDIS_URL || process.env.REDIS_URL)!,
      {
        ...options,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
        enableOfflineQueue: true,
      }
    );
  }

  return redisQueue;
}
