import { createHash } from 'node:crypto';
import type { Redis } from '@openpanel/redis';

/**
 * A Lua script sent as EVALSHA, so the body crosses the wire only when Redis
 * has not cached it yet (NOSCRIPT → EVAL, which caches it).
 */
export function defineRedisScript(lua: string) {
  const sha = createHash('sha1').update(lua).digest('hex');

  return async (
    redis: Redis,
    keys: string[],
    args: string[]
  ): Promise<unknown> => {
    try {
      return await redis.evalsha(sha, keys.length, ...keys, ...args);
    } catch (error) {
      const isNotCached =
        error instanceof Error && error.message.startsWith('NOSCRIPT');
      if (!isNotCached) {
        throw error;
      }
      return await redis.eval(lua, keys.length, ...keys, ...args);
    }
  };
}
