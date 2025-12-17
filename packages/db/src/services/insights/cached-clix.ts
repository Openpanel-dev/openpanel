import crypto from 'node:crypto';
import type { ClickHouseClient } from '@clickhouse/client';
import {
  type Query,
  clix as originalClix,
} from '../../clickhouse/query-builder';

/**
 * Creates a cached wrapper around clix that automatically caches query results
 * based on query hash. This eliminates duplicate queries within the same module/window context.
 *
 * @param client - ClickHouse client
 * @param cache - Optional cache Map to store query results
 * @param timezone - Timezone for queries (defaults to UTC)
 * @returns A function that creates cached Query instances (compatible with clix API)
 */
export function createCachedClix(
  client: ClickHouseClient,
  cache?: Map<string, any>,
  timezone?: string,
) {
  function clixCached(): Query {
    const query = originalClix(client, timezone);
    const queryTimezone = timezone ?? 'UTC';

    // Override execute() method to add caching
    const originalExecute = query.execute.bind(query);
    query.execute = async () => {
      // Build the query SQL string
      const querySQL = query.toSQL();

      // Create cache key from query SQL + timezone
      const cacheKey = crypto
        .createHash('sha256')
        .update(`${querySQL}|${queryTimezone}`)
        .digest('hex');

      // Check cache first
      if (cache?.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      // Execute query
      const result = await originalExecute();

      // Cache the result
      if (cache) {
        cache.set(cacheKey, result);
      }

      return result;
    };

    return query;
  }

  // Copy static methods from original clix
  clixCached.exp = originalClix.exp;
  clixCached.date = originalClix.date;
  clixCached.datetime = originalClix.datetime;
  clixCached.dynamicDatetime = originalClix.dynamicDatetime;
  clixCached.toStartOf = originalClix.toStartOf;
  clixCached.toStartOfInterval = originalClix.toStartOfInterval;
  clixCached.toInterval = originalClix.toInterval;
  clixCached.toDate = originalClix.toDate;

  return clixCached;
}
