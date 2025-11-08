#!/usr/bin/env tsx
/**
 * Cleanup script for old event buffer architecture Redis keys
 *
 * This script removes Redis keys from the previous complex event buffer implementation:
 * - event_buffer:sessions_sorted (sorted set)
 * - event_buffer:ready_sessions (sorted set)
 * - event_buffer:session:{sessionId} (lists)
 * - event_buffer:regular_queue (old queue key, now event_buffer:queue)
 *
 * The new simplified architecture uses:
 * - event_buffer:queue (new queue key)
 * - event_buffer:last_screen_view:session:{sessionId}
 * - event_buffer:last_screen_view:profile:{projectId}:{profileId}
 * - event_buffer:total_count
 */

import { createLogger } from '@openpanel/logger';
import { getRedisCache } from '@openpanel/redis';

const redis = getRedisCache();
const logger = createLogger({ name: 'cleanup-event-buffer' });

interface CleanupStats {
  sessionsSorted: number;
  readySessions: number;
  sessionLists: number;
  regularQueue: number;
  totalEventsMigrated: number;
  totalKeysDeleted: number;
  errors: number;
}

async function cleanupOldEventBufferKeys(): Promise<CleanupStats> {
  const stats: CleanupStats = {
    sessionsSorted: 0,
    readySessions: 0,
    sessionLists: 0,
    regularQueue: 0,
    totalEventsMigrated: 0,
    totalKeysDeleted: 0,
    errors: 0,
  };

  logger.info('Starting cleanup of old event buffer keys...');

  try {
    // 1. Get all session IDs from both sorted sets
    const sessionsSortedKey = 'event_buffer:sessions_sorted';
    const readySessionsKey = 'event_buffer:ready_sessions';

    const [sessionsSortedExists, readySessionsExists] = await Promise.all([
      redis.exists(sessionsSortedKey),
      redis.exists(readySessionsKey),
    ]);

    let allSessionIds: string[] = [];

    // Collect session IDs from sessions_sorted
    if (sessionsSortedExists) {
      const sessionIds = await redis.zrange(sessionsSortedKey, 0, -1);
      stats.sessionsSorted = sessionIds.length;
      allSessionIds = sessionIds;
      logger.info(`Found ${sessionIds.length} sessions in sessions_sorted`);
    } else {
      logger.info(`${sessionsSortedKey} does not exist (already cleaned up)`);
    }

    // Also check ready_sessions (might have additional sessions)
    if (readySessionsExists) {
      const readySessionIds = await redis.zrange(readySessionsKey, 0, -1);
      stats.readySessions = readySessionIds.length;
      logger.info(`Found ${readySessionIds.length} sessions in ready_sessions`);

      // Merge with allSessionIds (avoid duplicates)
      const uniqueReadySessions = readySessionIds.filter(
        (id) => !allSessionIds.includes(id),
      );
      if (uniqueReadySessions.length > 0) {
        logger.info(
          `Found ${uniqueReadySessions.length} additional sessions in ready_sessions`,
        );
        allSessionIds = [...allSessionIds, ...uniqueReadySessions];
      }
    } else {
      logger.info(`${readySessionsKey} does not exist (already cleaned up)`);
    }

    // 2. Migrate events from session lists to new queue
    if (allSessionIds.length > 0) {
      logger.info(
        `Migrating events from ${allSessionIds.length} session lists to new queue...`,
      );
      const newQueueKey = 'event_buffer:queue';
      let totalEventsMigrated = 0;

      // Process in batches
      const batchSize = 100;
      for (let i = 0; i < allSessionIds.length; i += batchSize) {
        const batchIds = allSessionIds.slice(i, i + batchSize);

        for (const sessionId of batchIds) {
          const sessionKey = `event_buffer:session:${sessionId}`;
          const events = await redis.lrange(sessionKey, 0, -1);

          if (events.length > 0) {
            // Move events to new queue in safe batches to avoid exceeding V8 arg limits
            const chunkSize = 1000;
            for (let offset = 0; offset < events.length; offset = chunkSize) {
              const chunk = events.slice(offset, offset + chunkSize);
              await redis.rpush(newQueueKey, ...chunk);
            }
            // Update buffer counter
            await redis.incrby('event_buffer:total_count', events.length);
            totalEventsMigrated += events.length;
            stats.totalEventsMigrated += events.length;
          }

          // Delete the session list
          await redis.del(sessionKey);
          stats.sessionLists++;
          stats.totalKeysDeleted++;
        }

        logger.info(
          `Processed batch ${Math.floor(i / batchSize) + 1}: ${batchIds.length} sessions, ${totalEventsMigrated} total events migrated`,
        );
      }

      logger.info(
        `✅ Migrated ${totalEventsMigrated} events from session lists to new queue`,
      );
    }

    // 3. Delete the sorted sets
    const keysToDelete: string[] = [];
    if (sessionsSortedExists) keysToDelete.push(sessionsSortedKey);
    if (readySessionsExists) keysToDelete.push(readySessionsKey);

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
      stats.totalKeysDeleted += keysToDelete.length;
      logger.info(`Deleted sorted sets: ${keysToDelete.join(', ')}`);
    }

    // 4. Check and handle regular_queue (old queue key)
    const regularQueueKey = 'event_buffer:regular_queue';
    const regularQueueExists = await redis.exists(regularQueueKey);
    if (regularQueueExists) {
      const queueLength = await redis.llen(regularQueueKey);
      stats.regularQueue = queueLength;

      if (queueLength > 0) {
        logger.info(`Found ${queueLength} events in old regular_queue`);
        logger.warn('WARNING: Old regular_queue has pending events!');
        logger.info('Moving events from old queue to new queue...');

        // Move events from old queue to new queue
        const newQueueKey = 'event_buffer:queue';
        let movedCount = 0;
        while (true) {
          const event = await redis.rpoplpush(regularQueueKey, newQueueKey);
          if (!event) break;
          movedCount++;
          if (movedCount % 1000 === 0) {
            logger.info(`Moved ${movedCount} events...`);
          }
        }
        logger.info(`Moved ${movedCount} events from old queue to new queue`);
        stats.totalEventsMigrated += movedCount;
      }

      // Delete the old queue key
      await redis.del(regularQueueKey);
      logger.info(`Deleted ${regularQueueKey}`);
      stats.totalKeysDeleted++;
    } else {
      logger.info(`${regularQueueKey} does not exist (already cleaned up)`);
    }

    // 5. Scan for any remaining event_buffer:session:* keys that might have been missed
    logger.info('Scanning for any remaining session keys...');
    let cursor = '0';
    let remainingSessionKeys = 0;

    do {
      const [newCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        'event_buffer:session:*',
        'COUNT',
        100,
      );
      cursor = newCursor;

      if (keys.length > 0) {
        const deleted = await redis.del(...keys);
        remainingSessionKeys += deleted;
        stats.totalKeysDeleted += deleted;
        logger.info(`Found and deleted ${deleted} remaining session keys`);
      }
    } while (cursor !== '0');

    if (remainingSessionKeys > 0) {
      logger.info(`Cleaned up ${remainingSessionKeys} remaining session keys`);
    } else {
      logger.info('No remaining session keys found');
    }

    logger.info('Cleanup completed successfully!', stats);
    return stats;
  } catch (error) {
    stats.errors++;
    logger.error('Error during cleanup:', error);
    throw error;
  }
}

async function main() {
  try {
    logger.info('Event Buffer Cleanup Script');
    logger.info('===========================');
    logger.info(
      'This script will remove old event buffer Redis keys from the previous architecture.',
    );
    logger.info('');

    // Check current state
    const sessionsSortedExists = await redis.exists(
      'event_buffer:sessions_sorted',
    );
    const readySessionsExists = await redis.exists(
      'event_buffer:ready_sessions',
    );
    const regularQueueExists = await redis.exists('event_buffer:regular_queue');

    if (!sessionsSortedExists && !readySessionsExists && !regularQueueExists) {
      logger.info(
        '✅ No old keys found. System appears to be already cleaned up!',
      );
      process.exit(0);
    }

    logger.info('Found old keys to clean up:');
    if (sessionsSortedExists) logger.info('  - event_buffer:sessions_sorted ✓');
    if (readySessionsExists) logger.info('  - event_buffer:ready_sessions ✓');
    if (regularQueueExists) logger.info('  - event_buffer:regular_queue ✓');
    logger.info('');

    // Perform cleanup
    const stats = await cleanupOldEventBufferKeys();

    // Summary
    logger.info('');
    logger.info('Cleanup Summary');
    logger.info('===============');
    logger.info(`Sessions sorted entries: ${stats.sessionsSorted}`);
    logger.info(`Ready sessions entries: ${stats.readySessions}`);
    logger.info(`Session list keys deleted: ${stats.sessionLists}`);
    logger.info(`Regular queue events: ${stats.regularQueue} (migrated)`);
    logger.info(`Total events migrated: ${stats.totalEventsMigrated}`);
    logger.info(`Total keys deleted: ${stats.totalKeysDeleted}`);
    logger.info(`Errors: ${stats.errors}`);
    logger.info('');

    if (stats.errors === 0) {
      logger.info('✅ Cleanup completed successfully!');
    } else {
      logger.warn(`⚠️  Cleanup completed with ${stats.errors} errors`);
    }

    // Close Redis connection
    await redis.quit();
    process.exit(0);
  } catch (error) {
    logger.error('Fatal error during cleanup:', error);
    await redis.quit();
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { cleanupOldEventBufferKeys };
