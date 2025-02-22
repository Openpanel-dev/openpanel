import { getRedisCache } from './redis';

export async function getCache<T>(
  key: string,
  expireInSec: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = await getRedisCache().get(key);
  if (hit) {
    return JSON.parse(hit, (_, value) => {
      if (
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/.test(value)
      ) {
        return new Date(value);
      }
      return value;
    });
  }

  const data = await fn();
  await getRedisCache().setex(key, expireInSec, JSON.stringify(data));
  return data;
}

export function cacheable<T extends (...args: any) => any>(
  fn: T,
  expireInSec: number,
) {
  const cachePrefix = `cachable:${fn.name}`;
  function stringify(obj: unknown): string {
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';
    if (typeof obj === 'boolean') return obj ? 'true' : 'false';
    if (typeof obj === 'number') return String(obj);
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'function') return obj.toString();

    if (Array.isArray(obj)) {
      return `[${obj.map(stringify).join(',')}]`;
    }

    if (typeof obj === 'object') {
      const pairs = Object.entries(obj)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${stringify(value)}`);
      return pairs.join(':');
    }

    // Fallback for any other types
    return String(obj);
  }
  const getKey = (...args: Parameters<T>) =>
    `${cachePrefix}:${stringify(args)}`;
  const cachedFn = async (
    ...args: Parameters<T>
  ): Promise<Awaited<ReturnType<T>>> => {
    // JSON.stringify here is not bullet proof since ordering of object keys matters etc
    const key = getKey(...args);
    const cached = await getRedisCache().get(key);
    if (cached) {
      try {
        return JSON.parse(cached, (_, value) => {
          if (
            typeof value === 'string' &&
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/.test(value)
          ) {
            return new Date(value);
          }
          return value;
        });
      } catch (e) {
        console.error('Failed to parse cache', e);
      }
    }
    const result = await fn(...(args as any));

    if (result !== undefined || result !== null) {
      getRedisCache().setex(key, expireInSec, JSON.stringify(result));
    }

    return result;
  };

  cachedFn.getKey = getKey;
  cachedFn.clear = async (...args: Parameters<T>) => {
    const key = getKey(...args);
    return getRedisCache().del(key);
  };

  return cachedFn;
}
