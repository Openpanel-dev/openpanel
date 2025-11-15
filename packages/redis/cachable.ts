import { LRUCache } from 'lru-cache';
import { getRedisCache } from './redis';

export const deleteCache = async (key: string) => {
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

export interface CacheableLruOptions {
  /** TTL in seconds for LRU cache */
  ttl: number;
  /** Maximum number of entries in LRU cache */
  maxSize?: number;
}

// Overload 1: cacheable(fn, expireInSec)
export function cacheable<T extends (...args: any) => any>(
  fn: T,
  expireInSec: number,
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
  expireInSec: number,
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
  _expireInSec?: number,
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
    `${cachePrefix}:${stringify(args)}`;

  // Redis-only mode: asynchronous implementation
  const cachedFn = async (
    ...args: Parameters<T>
  ): Promise<Awaited<ReturnType<T>>> => {
    const key = getKey(...args);

    // Check Redis cache (shared across instances)
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

    // Cache miss: Execute function
    const result = await fn(...(args as any));

    if (hasResult(result)) {
      // Don't await Redis write - fire and forget for better performance
      getRedisCache()
        .setex(key, expireInSec, JSON.stringify(result))
        .catch(() => {});
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
      return getRedisCache()
        .setex(key, expireInSec, JSON.stringify(payload))
        .catch(() => {});
    };

  return cachedFn;
}

// Overload 1: cacheableLru(fn, options)
export function cacheableLru<T extends (...args: any) => any>(
  fn: T,
  options: CacheableLruOptions,
): T & {
  getKey: (...args: Parameters<T>) => string;
  clear: (...args: Parameters<T>) => boolean;
  set: (...args: Parameters<T>) => (payload: ReturnType<T>) => void;
};

// Overload 2: cacheableLru(name, fn, options)
export function cacheableLru<T extends (...args: any) => any>(
  name: string,
  fn: T,
  options: CacheableLruOptions,
): T & {
  getKey: (...args: Parameters<T>) => string;
  clear: (...args: Parameters<T>) => boolean;
  set: (...args: Parameters<T>) => (payload: ReturnType<T>) => void;
};

// Implementation for cacheableLru (LRU-only - synchronous)
export function cacheableLru<T extends (...args: any) => any>(
  fnOrName: T | string,
  fnOrOptions: T | CacheableLruOptions,
  _options?: CacheableLruOptions,
) {
  const name = typeof fnOrName === 'string' ? fnOrName : fnOrName.name;
  const fn =
    typeof fnOrName === 'function'
      ? fnOrName
      : typeof fnOrOptions === 'function'
        ? fnOrOptions
        : null;

  let options: CacheableLruOptions;

  // Parse parameters based on function signature
  if (typeof fnOrName === 'function') {
    // Overload 1: cacheableLru(fn, options)
    options =
      typeof fnOrOptions === 'object' && fnOrOptions !== null
        ? fnOrOptions
        : ({} as CacheableLruOptions);
  } else {
    // Overload 2: cacheableLru(name, fn, options)
    options =
      typeof _options === 'object' && _options !== null
        ? _options
        : ({} as CacheableLruOptions);
  }

  if (typeof fn !== 'function') {
    throw new Error('fn is not a function');
  }

  if (typeof options.ttl !== 'number') {
    throw new Error('options.ttl is required and must be a number');
  }

  const cachePrefix = `cachable:${name}`;
  const getKey = (...args: Parameters<T>) =>
    `${cachePrefix}:${stringify(args)}`;

  const maxSize = options.maxSize ?? 1000;
  const ttl = options.ttl;

  // Create function-specific LRU cache
  const functionLruCache = new LRUCache<string, any>({
    max: maxSize,
    ttl: ttl * 1000, // Convert seconds to milliseconds for LRU
  });

  // LRU-only mode: synchronous implementation (or returns promise if fn is async)
  const cachedFn = ((...args: Parameters<T>): ReturnType<T> => {
    const key = getKey(...args);

    // Check LRU cache
    const lruHit = functionLruCache.get(key);
    if (lruHit !== undefined && hasResult(lruHit)) {
      return lruHit as ReturnType<T>;
    }

    // Cache miss: Execute function
    const result = fn(...(args as any)) as ReturnType<T>;

    // If result is a Promise, handle it asynchronously but cache the resolved value
    if (result && typeof (result as any).then === 'function') {
      return (result as Promise<any>).then((resolved: any) => {
        if (hasResult(resolved)) {
          functionLruCache.set(key, resolved);
        }
        return resolved;
      }) as ReturnType<T>;
    }

    // Synchronous result: cache and return
    if (hasResult(result)) {
      functionLruCache.set(key, result);
    }

    return result;
  }) as T & {
    getKey: (...args: Parameters<T>) => string;
    clear: (...args: Parameters<T>) => boolean;
    set: (...args: Parameters<T>) => (payload: ReturnType<T>) => void;
  };

  cachedFn.getKey = getKey;
  cachedFn.clear = (...args: Parameters<T>) => {
    const key = getKey(...args);
    return functionLruCache.delete(key);
  };
  cachedFn.set =
    (...args: Parameters<T>) =>
    (payload: ReturnType<T>) => {
      const key = getKey(...args);
      if (hasResult(payload)) {
        functionLruCache.set(key, payload);
      }
    };

  return cachedFn;
}
