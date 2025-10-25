import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheable, getCache } from './cachable';
import { getRedisCache } from './redis';

describe('cachable', () => {
  let redis: any;

  beforeEach(async () => {
    redis = getRedisCache();
    // Clear any existing cache data for clean tests
    const keys = await redis.keys('cachable:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterEach(async () => {
    // Clean up after each test
    const keys = await redis.keys('cachable:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('getCache', () => {
    it('should return cached data when available', async () => {
      const mockData = { id: 1, name: 'test' };
      const mockDate = new Date('2023-01-01T00:00:00Z');
      const cachedData = { ...mockData, createdAt: mockDate };

      // First, cache some data
      await redis.setex('test-key', 3600, JSON.stringify(cachedData));

      let fnCalled = false;
      const fn = async () => {
        fnCalled = true;
        return mockData;
      };

      const result = await getCache('test-key', 3600, fn);

      expect(result).toEqual(cachedData);
      expect(fnCalled).toBe(false);
    });

    it('should call function and cache result when no cache exists', async () => {
      const mockData = { id: 1, name: 'test' };

      let fnCalled = false;
      const fn = async () => {
        fnCalled = true;
        return mockData;
      };

      const result = await getCache('test-key-2', 3600, fn);

      expect(result).toEqual(mockData);
      expect(fnCalled).toBe(true);

      // Verify it was cached
      const cached = await redis.get('test-key-2');
      expect(cached).toBe(JSON.stringify(mockData));
    });

    it('should parse Date objects from cached JSON', async () => {
      const mockDate = new Date('2023-01-01T00:00:00Z');
      const cachedData = { id: 1, createdAt: mockDate };

      // Cache the data first
      await redis.setex('test-key', 3600, JSON.stringify(cachedData));

      let fnCalled = false;
      const fn = async () => {
        fnCalled = true;
        return { id: 1 };
      };

      const result = await getCache('test-key', 3600, fn);

      expect((result as any).createdAt).toBeInstanceOf(Date);
      expect((result as any).createdAt.getTime()).toBe(mockDate.getTime());
      expect(fnCalled).toBe(false);
    });
  });

  describe('cacheable', () => {
    it('should create a cached function with function and expire time', async () => {
      const mockData = { id: 1, name: 'test' };

      let fnCalled = false;
      const fn = async (arg1: string, arg2: string) => {
        fnCalled = true;
        return mockData;
      };

      const cachedFn = cacheable(fn, 3600);
      const result = await cachedFn('arg1', 'arg2');

      expect(result).toEqual(mockData);
      expect(fnCalled).toBe(true);

      // Verify it was cached
      const key = cachedFn.getKey('arg1', 'arg2');
      const cached = await redis.get(key);
      expect(cached).toBe(JSON.stringify(mockData));
    });

    it('should create a cached function with name, function and expire time', async () => {
      const mockData = { id: 1, name: 'test' };

      let fnCalled = false;
      const fn = async (arg1: string, arg2: string) => {
        fnCalled = true;
        return mockData;
      };

      const cachedFn = cacheable('testFunction', fn, 3600);
      const result = await cachedFn('arg1', 'arg2');

      expect(result).toEqual(mockData);
      expect(fnCalled).toBe(true);

      // Verify it was cached
      const key = cachedFn.getKey('arg1', 'arg2');
      const cached = await redis.get(key);
      expect(cached).toBe(JSON.stringify(mockData));
    });

    it('should return cached result when available', async () => {
      const mockData = { id: 1, name: 'test' };

      // First cache some data
      const cachedFn = cacheable(
        'testFunction',
        async (arg1: string, arg2: string) => mockData,
        3600,
      );
      await cachedFn('arg1', 'arg2');

      // Now test that it returns cached data
      let fnCalled = false;
      const fn = async (arg1: string, arg2: string) => {
        fnCalled = true;
        return { id: 2, name: 'different' };
      };

      const newCachedFn = cacheable('testFunction', fn, 3600);
      const result = await newCachedFn('arg1', 'arg2');

      expect(result).toEqual(mockData);
      expect(fnCalled).toBe(false);
    });

    it('should not cache undefined results', async () => {
      let fnCalled = false;
      const fn = async (arg1: string) => {
        fnCalled = true;
        return undefined;
      };

      const cachedFn = cacheable(fn, 3600);
      const result = await cachedFn('arg1');

      expect(result).toBeUndefined();
      expect(fnCalled).toBe(true);

      // Verify nothing was cached
      const key = cachedFn.getKey('arg1');
      const cached = await redis.get(key);
      expect(cached).toBeNull();
    });

    it('should not cache null results', async () => {
      let fnCalled = false;
      const fn = async (arg1: string) => {
        fnCalled = true;
        return null;
      };

      const cachedFn = cacheable(fn, 3600);
      const result = await cachedFn('arg1');

      expect(result).toBeNull();
      expect(fnCalled).toBe(true);

      // Verify nothing was cached
      const key = cachedFn.getKey('arg1');
      const cached = await redis.get(key);
      expect(cached).toBeNull();
    });

    it('should not cache empty strings', async () => {
      let fnCalled = false;
      const fn = async (arg1: string) => {
        fnCalled = true;
        return '';
      };

      const cachedFn = cacheable(fn, 3600);
      const result = await cachedFn('arg1');

      expect(result).toBe('');
      expect(fnCalled).toBe(true);

      // Verify nothing was cached
      const key = cachedFn.getKey('arg1');
      const cached = await redis.get(key);
      expect(cached).toBeNull();
    });

    it('should not cache empty arrays', async () => {
      let fnCalled = false;
      const fn = async (arg1: string) => {
        fnCalled = true;
        return [];
      };

      const cachedFn = cacheable(fn, 3600);
      const result = await cachedFn('arg1');

      expect(result).toEqual([]);
      expect(fnCalled).toBe(true);

      // Verify nothing was cached
      const key = cachedFn.getKey('arg1');
      const cached = await redis.get(key);
      expect(cached).toBeNull();
    });

    it('should not cache empty objects', async () => {
      let fnCalled = false;
      const fn = async (arg1: string) => {
        fnCalled = true;
        return {};
      };

      const cachedFn = cacheable(fn, 3600);
      const result = await cachedFn('arg1');

      expect(result).toEqual({});
      expect(fnCalled).toBe(true);

      // Verify nothing was cached
      const key = cachedFn.getKey('arg1');
      const cached = await redis.get(key);
      expect(cached).toBeNull();
    });

    it('should cache non-empty strings', async () => {
      let fnCalled = false;
      const fn = async (arg1: string) => {
        fnCalled = true;
        return 'hello';
      };

      const cachedFn = cacheable(fn, 3600);
      const result = await cachedFn('arg1');

      expect(result).toBe('hello');
      expect(fnCalled).toBe(true);

      // Verify it was cached
      const key = cachedFn.getKey('arg1');
      const cached = await redis.get(key);
      expect(cached).toBe('"hello"');
    });

    it('should cache non-empty arrays', async () => {
      let fnCalled = false;
      const fn = async (arg1: string) => {
        fnCalled = true;
        return [1, 2, 3];
      };

      const cachedFn = cacheable(fn, 3600);
      const result = await cachedFn('arg1');

      expect(result).toEqual([1, 2, 3]);
      expect(fnCalled).toBe(true);

      // Verify it was cached
      const key = cachedFn.getKey('arg1');
      const cached = await redis.get(key);
      expect(cached).toBe('[1,2,3]');
    });

    it('should cache non-empty objects', async () => {
      let fnCalled = false;
      const fn = async (arg1: string) => {
        fnCalled = true;
        return { id: 1 };
      };

      const cachedFn = cacheable(fn, 3600);
      const result = await cachedFn('arg1');

      expect(result).toEqual({ id: 1 });
      expect(fnCalled).toBe(true);

      // Verify it was cached
      const key = cachedFn.getKey('arg1');
      const cached = await redis.get(key);
      expect(cached).toBe('{"id":1}');
    });

    it('should cache booleans', async () => {
      let fnCalled = false;
      const fn = async (arg1: string) => {
        fnCalled = true;
        return true;
      };

      const cachedFn = cacheable(fn, 3600);
      const result = await cachedFn('arg1');

      expect(result).toBe(true);
      expect(fnCalled).toBe(true);

      // Verify it was cached
      const key = cachedFn.getKey('arg1');
      const cached = await redis.get(key);
      expect(cached).toBe('true');
    });

    it('should cache numbers', async () => {
      let fnCalled = false;
      const fn = async (arg1: string) => {
        fnCalled = true;
        return 42;
      };

      const cachedFn = cacheable(fn, 3600);
      const result = await cachedFn('arg1');

      expect(result).toBe(42);
      expect(fnCalled).toBe(true);

      // Verify it was cached
      const key = cachedFn.getKey('arg1');
      const cached = await redis.get(key);
      expect(cached).toBe('42');
    });

    it('should handle cache parsing errors gracefully', async () => {
      const mockData = { id: 1, name: 'test' };

      // First, manually set invalid JSON in cache
      const cachedFn = cacheable(
        'testFunction',
        async (arg1: string) => mockData,
        3600,
      );
      const key = cachedFn.getKey('arg1');
      await redis.set(key, 'invalid json');

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      let fnCalled = false;
      const fn = async (arg1: string) => {
        fnCalled = true;
        return mockData;
      };

      const newCachedFn = cacheable('testFunction', fn, 3600);
      const result = await newCachedFn('arg1');

      expect(result).toEqual(mockData);
      expect(fnCalled).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse cache',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should parse Date objects from cached JSON', async () => {
      const mockDate = new Date('2023-01-01T00:00:00Z');
      const cachedData = { id: 1, createdAt: mockDate };

      // First cache some data with Date
      const cachedFn = cacheable(
        'testFunction',
        async (arg1: string) => cachedData,
        3600,
      );
      await cachedFn('arg1');

      // Now test that it returns cached data with proper Date parsing
      let fnCalled = false;
      const fn = async (arg1: string) => {
        fnCalled = true;
        return { id: 2 };
      };

      const newCachedFn = cacheable('testFunction', fn, 3600);
      const result = await newCachedFn('arg1');

      expect((result as any).createdAt).toBeInstanceOf(Date);
      expect((result as any).createdAt.getTime()).toBe(mockDate.getTime());
      expect(fnCalled).toBe(false);
    });

    it('should provide getKey method', () => {
      const fn = async (arg1: string, arg2: string) => ({});
      const cachedFn = cacheable(fn, 3600);

      expect(typeof cachedFn.getKey).toBe('function');
      const key = cachedFn.getKey('arg1', 'arg2');
      expect(key).toMatch(/^cachable:.*:\[arg1,arg2\]$/);
    });

    it('should provide clear method', async () => {
      const fn = async (arg1: string, arg2: string) => ({ id: 1 });
      const cachedFn = cacheable(fn, 3600);

      // First cache some data
      await cachedFn('arg1', 'arg2');

      // Verify it's cached
      const key = cachedFn.getKey('arg1', 'arg2');
      let cached = await redis.get(key);
      expect(cached).not.toBeNull();

      // Clear it
      const result = await cachedFn.clear('arg1', 'arg2');
      expect(result).toBe(1);

      // Verify it's cleared
      cached = await redis.get(key);
      expect(cached).toBeNull();
    });

    it('should provide set method', async () => {
      const fn = async (arg1: string, arg2: string) => ({});
      const cachedFn = cacheable(fn, 3600);

      const payload = { id: 1, name: 'test' };
      await cachedFn.set('arg1', 'arg2')(payload);

      // Verify it was set
      const key = cachedFn.getKey('arg1', 'arg2');
      const cached = await redis.get(key);
      expect(cached).toBe(JSON.stringify(payload));
    });

    it('should throw error when expire time is not provided', () => {
      const fn = async (arg1: string, arg2: string) => ({});
      expect(() => {
        cacheable(fn, undefined as any);
      }).toThrow('expireInSec is not a number');
    });

    it('should generate consistent cache keys for same arguments', () => {
      const fn = async (arg1: { a: number; b: number }, arg2: string) => ({});
      const cachedFn = cacheable(fn, 3600);

      const key1 = cachedFn.getKey({ a: 1, b: 2 }, 'test');
      const key2 = cachedFn.getKey({ b: 2, a: 1 }, 'test'); // Different order

      expect(key1).toBe(key2);
    });

    it('should handle complex argument types in cache keys', () => {
      const fn = async (
        arg1: string,
        arg2: number,
        arg3: boolean,
        arg4: null,
        arg5: undefined,
        arg6: number[],
        arg7: { a: number; b: number },
        arg8: Date,
      ) => ({});
      const cachedFn = cacheable(fn, 3600);

      const key = cachedFn.getKey(
        'string',
        123,
        true,
        null,
        undefined,
        [1, 2, 3],
        { a: 1, b: 2 },
        new Date('2023-01-01T00:00:00Z'),
      );

      expect(key).toMatch(/^cachable:.*:/);
    });
  });
});
