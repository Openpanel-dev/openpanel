import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL!);
export const redisSub = new Redis(process.env.REDIS_URL!);
export const redisPub = new Redis(process.env.REDIS_URL!);
