import type { RedisOptions } from 'ioredis';
import Redis from 'ioredis';

const options: RedisOptions = {
  connectTimeout: 10000, // default
  retryStrategy: (times: number) => {
    const maxRetryDelay = 5000;
    const delay = Math.min(times * 100, maxRetryDelay);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const reconnectErrors = ['READONLY', 'ETIMEDOUT', 'EPIPE', 'ECONNRESET'];
    return reconnectErrors.some(
      (errorType) => err.message.includes(errorType) || err.code === errorType,
    );
  },
  autoResubscribe: true, // default
  autoResendUnfulfilledCommands: true, // default
  maxRetriesPerRequest: 20, // default
};

export { Redis };

const createRedisClient = (
  url: string,
  overrides: RedisOptions,
  name: string,
): Redis => {
  const client = new Redis(url, { ...options, ...overrides });

  client.on('error', (error) => {
    console.error(`[redis:${name}] Error:`, error);
  });

  client.on('ready', () => {
    console.log(`[redis:${name}] Ready`);
  });

  client.on('connect', () => {
    console.log(`[redis:${name}] Connected`);
  });

  client.on('reconnecting', () => {
    console.log(`[redis:${name}] Reconnecting`);
  });

  client.on('end', () => {
    console.error(`[redis:${name}] Connection closed`);
  });

  return client;
};

let redisCache: Redis;
export function getRedisCache() {
  if (!redisCache) {
    redisCache = createRedisClient(process.env.REDIS_URL!, options, 'cache');
  }

  return redisCache;
}

let redisSub: Redis;
export function getRedisSub() {
  if (!redisSub) {
    redisSub = createRedisClient(process.env.REDIS_URL!, options, 'sub');
  }

  return redisSub;
}

let redisPub: Redis;
export function getRedisPub() {
  if (!redisPub) {
    redisPub = createRedisClient(process.env.REDIS_URL!, options, 'pub');
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
      },
      'queue',
    );
  }

  return redisQueue;
}

// TODO: Remove this once we have migrated all data
let _redisQueue: Redis;
export function _getRedisQueue() {
  if (!_redisQueue) {
    _redisQueue = createRedisClient(
      process.env.OLD_REDIS_URL! || process.env.REDIS_URL!,
      {
        ...options,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
        enableOfflineQueue: true,
      },
      'old_queue',
    );
  }

  return _redisQueue;
}
