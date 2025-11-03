/**
 * Migration Script: Migrate Delayed Jobs to New Queue Names
 *
 * This script migrates delayed jobs from old queue names (e.g., "sessions")
 * to new queue names with hash tags (e.g., "{sessions}").
 *
 * Active/waiting jobs are ignored - only delayed jobs are migrated.
 *
 * Usage:
 *   npx tsx apps/worker/scripts/migrate-delayed-jobs.ts
 *
 * Options:
 *   --dry-run    Show what would be migrated without actually doing it
 *   --queue      Migrate specific queue only (sessions, cron, notification, misc)
 *
 * # Dry run (recommended first)
 *   npx tsx apps/worker/scripts/migrate-delayed-jobs.ts --dry-run
 *
 * Migrate all queues
 *   npx tsx apps/worker/scripts/migrate-delayed-jobs.ts
 *
 * Migrate specific queue only
 *   npx tsx apps/worker/scripts/migrate-delayed-jobs.ts --queue=sessions
 *   npx tsx apps/worker/scripts/migrate-delayed-jobs.ts --queue=misc
 *
 */

import type {
  CronQueuePayload,
  MiscQueuePayload,
  NotificationQueuePayload,
  SessionsQueuePayload,
} from '@openpanel/queue';
import { getRedisQueue } from '@openpanel/redis';
import { Queue } from 'bullmq';

interface MigrationStats {
  queue: string;
  total: number;
  migrated: number;
  failed: number;
  skipped: number;
}

const isDryRun = process.argv.includes('--dry-run');
const specificQueue = process.argv
  .find((arg) => arg.startsWith('--queue='))
  ?.split('=')[1];

console.log('🚀 Starting delayed jobs migration');
console.log(
  `Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE MIGRATION'}`,
);
console.log(`Queue filter: ${specificQueue || 'all queues'}`);
console.log('---\n');

async function migrateDelayedJobs<T>(
  oldQueueName: string,
  newQueueName: string,
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    queue: oldQueueName,
    total: 0,
    migrated: 0,
    failed: 0,
    skipped: 0,
  };

  const connection = getRedisQueue();
  const oldQueue = new Queue<T>(oldQueueName, { connection });
  const newQueue = new Queue<T>(newQueueName, { connection });

  try {
    console.log(`\n📦 Processing queue: ${oldQueueName} → ${newQueueName}`);

    // Get all delayed jobs from old queue
    const delayedJobs = await oldQueue.getDelayed();
    stats.total = delayedJobs.length;

    console.log(`   Found ${stats.total} delayed jobs`);

    if (stats.total === 0) {
      console.log('   ✓ No delayed jobs to migrate');
      return stats;
    }

    for (const job of delayedJobs) {
      try {
        const delay = job.opts.delay || 0;
        const remainingDelay = Math.max(0, job.timestamp + delay - Date.now());

        console.log(
          `   - Job ${job.id}: ${job.name}, delay: ${Math.round(remainingDelay / 1000)}s remaining`,
        );

        if (!isDryRun) {
          // Add to new queue with remaining delay
          await newQueue.add(job.name || 'migrated-job', job.data, {
            ...job.opts,
            delay: remainingDelay,
            jobId: job.id, // Preserve job ID if possible
            attempts: job.opts.attempts,
            backoff: job.opts.backoff,
          });

          // Remove from old queue
          await job.remove();

          stats.migrated++;
          console.log('     ✓ Migrated');
        } else {
          stats.migrated++;
          console.log('     ✓ Would migrate (dry run)');
        }
      } catch (error) {
        stats.failed++;
        console.error(
          `     ✗ Failed to migrate job ${job.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    console.log(`\n   Summary for ${oldQueueName}:`);
    console.log(`   - Total: ${stats.total}`);
    console.log(`   - Migrated: ${stats.migrated}`);
    console.log(`   - Failed: ${stats.failed}`);
    console.log(`   - Skipped: ${stats.skipped}`);
  } catch (error) {
    console.error(`   ✗ Error processing queue ${oldQueueName}:`, error);
  } finally {
    await oldQueue.close();
    await newQueue.close();
  }

  return stats;
}

async function main() {
  const queuesToMigrate: Array<{ old: string; new: string }> = [
    { old: 'sessions', new: '{sessions}' },
    { old: 'misc', new: '{misc}' },
  ];

  // Filter to specific queue if requested
  const filtered = specificQueue
    ? queuesToMigrate.filter((q) => q.old === specificQueue)
    : queuesToMigrate;

  if (filtered.length === 0) {
    console.error(
      `❌ Queue "${specificQueue}" not found. Valid queues: sessions, cron, notification, misc`,
    );
    process.exit(1);
  }

  const allStats: MigrationStats[] = [];

  for (const { old: oldName, new: newName } of filtered) {
    const stats = await migrateDelayedJobs(oldName, newName);
    allStats.push(stats);
  }

  // Print summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 MIGRATION SUMMARY');
  console.log(`${'='.repeat(50)}\n`);

  let totalJobs = 0;
  let totalMigrated = 0;
  let totalFailed = 0;

  for (const stats of allStats) {
    totalJobs += stats.total;
    totalMigrated += stats.migrated;
    totalFailed += stats.failed;
  }

  console.log(`Total jobs found:     ${totalJobs}`);
  console.log(`Successfully migrated: ${totalMigrated}`);
  console.log(`Failed:               ${totalFailed}`);
  console.log(
    `\n${isDryRun ? '⚠️  This was a DRY RUN - no changes were made' : '✅ Migration complete!'}`,
  );

  if (totalFailed > 0) {
    console.log(
      '\n⚠️  Some jobs failed to migrate. Check the logs above for details.',
    );
    process.exit(1);
  }

  if (isDryRun && totalMigrated > 0) {
    console.log('\n💡 Run without --dry-run to perform the actual migration');
  }
}

main()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
