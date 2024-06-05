import { redis } from './redis';

export function cacheable<T extends (...args: any) => any>(
  fn: T,
  expire: number
) {
  return async function (...args: Parameters<T>): Promise<ReturnType<T>> {
    const key = `cachable:${fn.name}:${JSON.stringify(args)}`;
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    const result = await fn(...(args as any));
    redis.setex(key, expire, JSON.stringify(result));
    return result;
  };
}
