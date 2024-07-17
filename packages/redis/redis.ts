import type { RedisOptions } from 'ioredis';
import Redis from 'ioredis';

const options: RedisOptions = {
  connectTimeout: 30000,
  maxRetriesPerRequest: null,
};

export { Redis };

export const redis = new Redis(process.env.REDIS_URL!, options);
export const redisSub = new Redis(process.env.REDIS_URL!, options);
export const redisPub = new Redis(process.env.REDIS_URL!, options);
