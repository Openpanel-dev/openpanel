import { LRUCache } from 'lru-cache';
import { getRedisCache } from './redis';

export const deleteCache = (key: string) => {
  return getRedisCache().del(key);
};

// Global LRU cache for getCache function
const globalLruCache = new LRUCache<string, any>({
  max: 5000, // Store up to 5000 entries
  ttl: 1000 * 60, // 1 minutes default TTL
});

export async function getCache<T>(
  key: string,
  expireInSec: number,
  fn: () => Promise<T>,
  useLruCache?: boolean
): Promise<T> {
  // L1 Cache: Check global LRU cache first (in-memory, instant)
  if (useLruCache) {
    const lruHit = globalLruCache.get(key);
    if (lruHit !== undefined) {
      return lruHit as T;
    }
  }

  // L2 Cache: Check Redis cache (shared across instances)
  const hit = await getRedisCache().get(key);
  if (hit) {
    const parsed = parseCache(hit);

    // Store in LRU cache for next time
    if (useLruCache) {
      globalLruCache.set(key, parsed, {
        ttl: expireInSec * 1000, // Use the same TTL as Redis
      });
    }

    return parsed;
  }

  // Cache miss: Execute function
  const data = await fn();

  // Store in both caches
  if (useLruCache) {
    globalLruCache.set(key, data, {
      ttl: expireInSec * 1000,
    });
  }
  // Fire and forget Redis write for better performance
  getRedisCache().setex(key, expireInSec, JSON.stringify(data));

  return data;
}

// Helper functions for managing global LRU cache
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
const CACHEABLE_LRU_TTL_MS = 60 * 1000; // 60 seconds
const CACHEABLE_LRU_MAX = 1000;

// Overload 1: cacheable(fn, expireInSec)
export function cacheable<T extends (...args: any) => any>(
  fn: T,
  expireInSec: number
): T & {
  getKey: (...args: Parameters<T>) => string;
  clear: (...args: Parameters<T>) => Promise<number>;
  set: (
    ...args: Parameters<T>
  ) => (payload: Awaited<ReturnType<T>>) => Promise<'OK'>;
};

// Overload 2: cacheable(name, fn, expireInSec)
export function cacheable<T extends (...args: any) => any>(
  name: string,
  fn: T,
  expireInSec: number
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
  _expireInSec?: number
) {
  const name = typeof fnOrName === 'string' ? fnOrName : fnOrName.name;
  const fn =
    typeof fnOrName === 'function'
      ? fnOrName
      : typeof fnOrExpireInSec === 'function'
        ? fnOrExpireInSec
        : null;

  let expireInSec: number | null = null;

  // Parse parameters based on function signature
  if (typeof fnOrName === 'function') {
    // Overload 1: cacheable(fn, expireInSec)
    expireInSec = typeof fnOrExpireInSec === 'number' ? fnOrExpireInSec : null;
  } else {
    // Overload 2: cacheable(name, fn, expireInSec)
    expireInSec = typeof _expireInSec === 'number' ? _expireInSec : null;
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
    if (lruHit !== undefined && hasResult(lruHit)) {
      return lruHit as Awaited<ReturnType<T>>;
    }

    // L2: Redis (shared across instances)
    const cached = await getRedisCache().get(key);
    if (cached) {
      const parsed = parseCache(cached);
      if (hasResult(parsed)) {
        lruCache.set(key, parsed);
        return parsed;
      }
    }

    // Cache miss: execute function
    const result = await fn(...(args as any));

    if (hasResult(result)) {
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
      if (hasResult(payload)) {
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
