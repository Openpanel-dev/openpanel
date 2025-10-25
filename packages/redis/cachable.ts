import { LRUCache } from 'lru-cache';
import { getRedisCache } from './redis';

// Global LRU cache for getCache function
const globalLruCache = new LRUCache<string, any>({
  max: 5000, // Store up to 5000 entries
  ttl: 1000 * 60, // 1 minutes default TTL
});

export async function getCache<T>(
  key: string,
  expireInSec: number,
  fn: () => Promise<T>,
  useLruCache?: boolean,
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
    const parsed = JSON.parse(hit, (_, value) => {
      if (
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/.test(value)
      ) {
        return new Date(value);
      }
      return value;
    });

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

// Overload 1: cacheable(fn, expireInSec, lruCache?)
export function cacheable<T extends (...args: any) => any>(
  fn: T,
  expireInSec: number,
  lruCache?: boolean,
): T & {
  getKey: (...args: Parameters<T>) => string;
  clear: (...args: Parameters<T>) => Promise<number>;
  set: (
    ...args: Parameters<T>
  ) => (payload: Awaited<ReturnType<T>>) => Promise<'OK'>;
};

// Overload 2: cacheable(name, fn, expireInSec, lruCache?)
export function cacheable<T extends (...args: any) => any>(
  name: string,
  fn: T,
  expireInSec: number,
  lruCache?: boolean,
): T & {
  getKey: (...args: Parameters<T>) => string;
  clear: (...args: Parameters<T>) => Promise<number>;
  set: (
    ...args: Parameters<T>
  ) => (payload: Awaited<ReturnType<T>>) => Promise<'OK'>;
};

// Implementation
export function cacheable<T extends (...args: any) => any>(
  fnOrName: T | string,
  fnOrExpireInSec: number | T,
  _expireInSecOrLruCache?: number | boolean,
  _lruCache?: boolean,
) {
  const name = typeof fnOrName === 'string' ? fnOrName : fnOrName.name;
  const fn =
    typeof fnOrName === 'function'
      ? fnOrName
      : typeof fnOrExpireInSec === 'function'
        ? fnOrExpireInSec
        : null;

  let expireInSec: number | null = null;
  let useLruCache = false;

  // Parse parameters based on function signature
  if (typeof fnOrName === 'function') {
    // Overload 1: cacheable(fn, expireInSec, lruCache?)
    expireInSec = typeof fnOrExpireInSec === 'number' ? fnOrExpireInSec : null;
    useLruCache =
      typeof _expireInSecOrLruCache === 'boolean'
        ? _expireInSecOrLruCache
        : false;
  } else {
    // Overload 2: cacheable(name, fn, expireInSec, lruCache?)
    expireInSec =
      typeof _expireInSecOrLruCache === 'number'
        ? _expireInSecOrLruCache
        : null;
    useLruCache = typeof _lruCache === 'boolean' ? _lruCache : false;
  }

  if (typeof fn !== 'function') {
    throw new Error('fn is not a function');
  }

  if (typeof expireInSec !== 'number') {
    throw new Error('expireInSec is not a number');
  }

  const cachePrefix = `cachable:${name}`;
  const getKey = (...args: Parameters<T>) =>
    `${cachePrefix}:${stringify(args)}`;

  // Create function-specific LRU cache if enabled
  const functionLruCache = useLruCache
    ? new LRUCache<string, any>({
        max: 1000,
        ttl: expireInSec * 1000, // Convert seconds to milliseconds for LRU
      })
    : null;

  const cachedFn = async (
    ...args: Parameters<T>
  ): Promise<Awaited<ReturnType<T>>> => {
    const key = getKey(...args);

    // L1 Cache: Check LRU cache first (in-memory, instant)
    if (functionLruCache) {
      const lruHit = functionLruCache.get(key);
      if (lruHit !== undefined && hasResult(lruHit)) {
        return lruHit;
      }
    }

    // L2 Cache: Check Redis cache (shared across instances)
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
          // Store in LRU cache for next time
          if (functionLruCache) {
            functionLruCache.set(key, parsed);
          }
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse cache', e);
      }
    }

    // Cache miss: Execute function
    const result = await fn(...(args as any));

    if (hasResult(result)) {
      // Store in both caches
      if (functionLruCache) {
        functionLruCache.set(key, result);
      }
      // Don't await Redis write - fire and forget for better performance
      getRedisCache().setex(key, expireInSec, JSON.stringify(result));
    }

    return result;
  };

  cachedFn.getKey = getKey;
  cachedFn.clear = async (...args: Parameters<T>) => {
    const key = getKey(...args);
    // Clear both LRU and Redis caches
    if (functionLruCache) {
      functionLruCache.delete(key);
    }
    return getRedisCache().del(key);
  };
  cachedFn.set =
    (...args: Parameters<T>) =>
    async (payload: Awaited<ReturnType<T>>) => {
      const key = getKey(...args);
      // Set in both caches
      if (functionLruCache) {
        functionLruCache.set(key, payload);
      }
      return getRedisCache().setex(key, expireInSec, JSON.stringify(payload));
    };

  return cachedFn;
}
