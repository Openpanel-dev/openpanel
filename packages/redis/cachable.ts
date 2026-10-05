import { LRUCache } from 'lru-cache';
import { getRedisCache } from './redis';

export { LRUCache } from 'lru-cache';

export const deleteCache = (key: string) => {
  return getRedisCache().del(key);
};

const globalLruCache = new LRUCache<string, any>({
  max: 5000,
  ttl: 1000 * 60,
});

export async function getCache<T>(
  key: string,
  expireInSec: number,
  fn: () => Promise<T>,
  useLruCache?: boolean
): Promise<T> {
  if (useLruCache) {
    const lruHit = globalLruCache.get(key);
    if (lruHit !== undefined) {
      return lruHit as T;
    }
  }

  const hit = await getRedisCache().get(key);
  if (hit) {
    const parsed = parseCache(hit);

    if (useLruCache) {
      globalLruCache.set(key, parsed, {
        ttl: expireInSec * 1000,
      });
    }

    return parsed;
  }

  const data = await fn();

  if (useLruCache) {
    globalLruCache.set(key, data, {
      ttl: expireInSec * 1000,
    });
  }
  // Fire-and-forget: the caller does not wait on the Redis write.
  getRedisCache().setex(key, expireInSec, JSON.stringify(data));

  return data;
}

export function clearGlobalLruCache(key?: string) {
  if (key) {
    return globalLruCache.delete(key);
  }
  globalLruCache.clear();
  return true;
}

export function getGlobalLruCacheStats() {
  return {
    size: globalLruCache.size,
    max: globalLruCache.max,
    calculatedSize: globalLruCache.calculatedSize,
  };
}

function stringify(obj: unknown): string {
  if (obj === null) {
    return 'null';
  }
  if (obj === undefined) {
    return 'undefined';
  }
  if (typeof obj === 'boolean') {
    return obj ? 'true' : 'false';
  }
  if (typeof obj === 'number') {
    return String(obj);
  }
  if (typeof obj === 'string') {
    return obj;
  }
  if (typeof obj === 'function') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return `[${obj.map(stringify).join(',')}]`;
  }

  if (typeof obj === 'object') {
    const pairs = Object.entries(obj)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${stringify(value)}`);
    return pairs.join(':');
  }

  return String(obj);
}

export interface CacheableOptions {
  cacheEmptyArray?: boolean;
}

function shouldCache(result: unknown, options: CacheableOptions = {}): boolean {
  if (result === undefined || result === null) {
    return false;
  }

  if (typeof result === 'string') {
    return result.length > 0;
  }

  if (Array.isArray(result)) {
    return options.cacheEmptyArray ? true : result.length > 0;
  }

  if (typeof result === 'object' && result !== null) {
    return Object.keys(result).length > 0;
  }

  return true;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/;
const parseCache = (cached: string) => {
  try {
    return JSON.parse(cached, (_, value) => {
      if (typeof value === 'string' && DATE_REGEX.test(value)) {
        return new Date(value);
      }
      return value;
    });
  } catch (error) {
    console.error('Failed to parse cache', error);
    return null;
  }
};

// L1 cache: short TTL to offload Redis; clear() invalidates Redis, other nodes may serve stale from LRU for up to this long
const CACHEABLE_LRU_TTL_MS = 60 * 1000;
const CACHEABLE_LRU_MAX = 1000;

export function cacheable<T extends (...args: any) => any>(
  fn: T,
  expireInSec: number,
  options?: CacheableOptions
): T & {
  getKey: (...args: Parameters<T>) => string;
  clear: (...args: Parameters<T>) => Promise<number>;
  set: (
    ...args: Parameters<T>
  ) => (payload: Awaited<ReturnType<T>>) => Promise<'OK'>;
};

export function cacheable<T extends (...args: any) => any>(
  name: string,
  fn: T,
  expireInSec: number,
  options?: CacheableOptions
): T & {
  getKey: (...args: Parameters<T>) => string;
  clear: (...args: Parameters<T>) => Promise<number>;
  set: (
    ...args: Parameters<T>
  ) => (payload: Awaited<ReturnType<T>>) => Promise<'OK'>;
};

// Implementation for cacheable (Redis-only - async)
export function cacheable<T extends (...args: any) => any>(
  fnOrName: T | string,
  fnOrExpireInSec: number | T,
  expireInSecOrOptions?: number | CacheableOptions,
  maybeOptions?: CacheableOptions
) {
  const name = typeof fnOrName === 'string' ? fnOrName : fnOrName.name;
  const fn =
    typeof fnOrName === 'function'
      ? fnOrName
      : typeof fnOrExpireInSec === 'function'
        ? fnOrExpireInSec
        : null;

  let expireInSec: number | null = null;
  let options: CacheableOptions = {};

  if (typeof fnOrName === 'function') {
    expireInSec = typeof fnOrExpireInSec === 'number' ? fnOrExpireInSec : null;
    if (expireInSecOrOptions && typeof expireInSecOrOptions === 'object') {
      options = expireInSecOrOptions;
    }
  } else {
    expireInSec =
      typeof expireInSecOrOptions === 'number' ? expireInSecOrOptions : null;
    if (maybeOptions) {
      options = maybeOptions;
    }
  }

  if (typeof fn !== 'function') {
    throw new Error('fn is not a function');
  }

  if (typeof expireInSec !== 'number') {
    throw new Error('expireInSec is not a number');
  }

  const cachePrefix = `cachable:${name}`;
  const getKey = (...args: Parameters<T>) =>
    `${cachePrefix}:${stringify(args)}`.replaceAll(/\s/g, '');

  const lruCache = new LRUCache<string, any>({
    max: CACHEABLE_LRU_MAX,
    ttl: CACHEABLE_LRU_TTL_MS,
  });

  // L1 LRU (60s) + L2 Redis. clear() deletes Redis + local LRU; other nodes may serve stale from LRU for up to 60s.
  const cachedFn = async (
    ...args: Parameters<T>
  ): Promise<Awaited<ReturnType<T>>> => {
    const key = getKey(...args);

    // L1: in-memory LRU first (offloads Redis on hot keys)
    const lruHit = lruCache.get(key);
    if (lruHit !== undefined && shouldCache(lruHit, options)) {
      return lruHit as Awaited<ReturnType<T>>;
    }

    // L2: Redis (shared across instances)
    const cached = await getRedisCache().get(key);
    if (cached) {
      const parsed = parseCache(cached);
      if (shouldCache(parsed, options)) {
        lruCache.set(key, parsed);
        return parsed;
      }
    }

    const result = await fn(...(args as any));

    if (shouldCache(result, options)) {
      lruCache.set(key, result);
      getRedisCache()
        .setex(key, expireInSec, JSON.stringify(result))
        .catch(() => {
          // ignore error
        });
    }

    return result;
  };

  cachedFn.getKey = getKey;
  cachedFn.clear = (...args: Parameters<T>) => {
    const key = getKey(...args);
    lruCache.delete(key);
    return getRedisCache().del(key);
  };
  cachedFn.set =
    (...args: Parameters<T>) =>
    (payload: Awaited<ReturnType<T>>) => {
      const key = getKey(...args);
      if (shouldCache(payload, options)) {
        lruCache.set(key, payload);
        return getRedisCache()
          .setex(key, expireInSec, JSON.stringify(payload))
          .catch(() => {
            // ignore error
          });
      }
    };

  return cachedFn;
}
