import { db } from '@openpanel/db';
import { logger as baseLogger } from '@/utils/logger';

const logger = baseLogger.child({ job: 'insight-cleanup' });

const RETENTION_DAYS = Number.parseInt(
  process.env.INSIGHTS_RETENTION_DAYS || '90',
  10,
);

// Delete in chunks so the first (large) purge never holds a single long
// transaction / lock on these tables.
const BATCH_SIZE = 5000;

async function deleteInBatches(
  label: string,
  runBatch: () => Promise<number>,
): Promise<number> {
  let total = 0;
  // Cap iterations as a runaway backstop (BATCH_SIZE * 2000 = 10M rows).
  for (let i = 0; i < 2000; i++) {
    const deleted = await runBatch();
    total += deleted;
    if (deleted < BATCH_SIZE) break;
  }
  if (total > 0) {
    logger.info({ table: label, deleted: total }, 'Deleted stale rows');
  }
  return total;
}

/**
 * Keeps the insights tables bounded. They otherwise grow forever:
 * `insight_events` is append-only (one row per detection/material change),
 * and `project_insights` keeps a row per dimension ever seen.
 *
 * Retention rules (default 90 days, override via INSIGHTS_RETENTION_DAYS):
 *  - project_insights `suppressed`: deleted unconditionally. The engine no
 *    longer creates suppressed rows (below-top-N insights are deleted inline);
 *    any remaining ones are legacy leftovers nothing reads or revives.
 *  - project_insights `closed`: dropped once not seen since the cutoff.
 *    `active` rows are the live dataset and are never touched.
 *  - insight_events: drop rows older than the cutoff. Only the latest 20 per
 *    insight are ever read (the AI explain tool), so old events are dead
 *    weight. Deleting the parent insight above already cascades its events;
 *    this sweep also trims old history off still-active insights.
 */
export async function insightCleanupCronJob() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const suppressed = await deleteInBatches(
    'project_insights:suppressed',
    () => db.$executeRaw`
      DELETE FROM "project_insights"
      WHERE "id" IN (
        SELECT "id" FROM "project_insights"
        WHERE "state" = 'suppressed'
        LIMIT ${BATCH_SIZE}
      )`,
  );

  const closed = await deleteInBatches(
    'project_insights:closed',
    () => db.$executeRaw`
      DELETE FROM "project_insights"
      WHERE "id" IN (
        SELECT "id" FROM "project_insights"
        WHERE "state" = 'closed'
          AND "lastSeenAt" < ${cutoff}
        LIMIT ${BATCH_SIZE}
      )`,
  );
  const insights = suppressed + closed;

  const events = await deleteInBatches(
    'insight_events',
    () => db.$executeRaw`
      DELETE FROM "insight_events"
      WHERE "id" IN (
        SELECT "id" FROM "insight_events"
        WHERE "createdAt" < ${cutoff}
        LIMIT ${BATCH_SIZE}
      )`,
  );

  logger.info(
    { retentionDays: RETENTION_DAYS, insights, events },
    'Insight cleanup complete',
  );
}
