import { getRedisCache } from './redis';

export const deleteCache = async (key: string) => {
  return getRedisCache().del(key);
};

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

function hasResult(result: unknown): boolean {
  // Don't cache undefined or null
  if (result === undefined || result === null) {
    return false;
  }

  // Don't cache empty strings
  if (typeof result === 'string') {
    return result.length > 0;
  }

  // Don't cache empty arrays
  if (Array.isArray(result)) {
    return result.length > 0;
  }

  // Don't cache empty objects
  if (typeof result === 'object' && result !== null) {
    return Object.keys(result).length > 0;
  }

  // Cache everything else (booleans, numbers, etc.)
  return true;
}

export function cacheable<T extends (...args: any) => any>(
  fnOrName: T | string,
  fnOrExpireInSec: number | T,
  _expireInSec?: number,
) {
  const name = typeof fnOrName === 'string' ? fnOrName : fnOrName.name;
  const fn =
    typeof fnOrName === 'function'
      ? fnOrName
      : typeof fnOrExpireInSec === 'function'
        ? fnOrExpireInSec
        : null;
  const expireInSec =
    typeof fnOrExpireInSec === 'number'
      ? fnOrExpireInSec
      : typeof _expireInSec === 'number'
        ? _expireInSec
        : null;

  if (typeof fn !== 'function') {
    throw new Error('fn is not a function');
  }

  if (typeof expireInSec !== 'number') {
    throw new Error('expireInSec is not a number');
  }

  const cachePrefix = `cachable:${name}`;
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
        const parsed = JSON.parse(cached, (_, value) => {
          if (
            typeof value === 'string' &&
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/.test(value)
          ) {
            return new Date(value);
          }
          return value;
        });
        if (hasResult(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse cache', e);
      }
    }
    const result = await fn(...(args as any));

    if (hasResult(result)) {
      getRedisCache().setex(key, expireInSec, JSON.stringify(result));
    }

    return result;
  };

  cachedFn.getKey = getKey;
  cachedFn.clear = async (...args: Parameters<T>) => {
    const key = getKey(...args);
    return getRedisCache().del(key);
  };
  cachedFn.set =
    (...args: Parameters<T>) =>
    async (payload: Awaited<ReturnType<T>>) => {
      const key = getKey(...args);
      return getRedisCache().setex(key, expireInSec, JSON.stringify(payload));
    };

  return cachedFn;
}
