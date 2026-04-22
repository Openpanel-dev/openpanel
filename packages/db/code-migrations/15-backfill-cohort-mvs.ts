import { TABLE_NAMES } from '../src/clickhouse/client';
import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Backfill the two cohort MVs for the last 30 days.
 *
 *   - profile_event_summary_mv
 *   - profile_event_property_summary_mv
 *
 * Both were created with `populate: false` so they only index events inserted
 * AFTER their CREATE ran. This backfill feeds them the recent history so
 * cohorts with relative timeframes (e.g. "last 30 days") work immediately.
 *
 * AggregatingMergeTree merges *State aggregate values on read, so re-running
 * this migration is safe — duplicate rows collapse correctly.
 *
 * Flags:
 *   --dry         Print the first batch SQL and exit; don't execute.
 *   --days=N      Override the 30-day window (useful for testing).
 *   --batch-hours=N  How many hours of data to INSERT per batch (default 1).
 */

const DEFAULT_DAYS = 30;
const DEFAULT_BATCH_HOURS = 1;

type Batch = { startTime: string; endTime: string; sql: string };

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

function resolveTargetTable(baseName: string, isClustered: boolean): string {
  // INSERT targets the replicated (storage) side in clustered mode; writes
  // will distribute via the MV's own replication. In non-clustered mode,
  // there's only one table.
  return isClustered ? `${baseName}_replicated` : baseName;
}

function formatChDateTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function generateSummaryBatches(
  startDate: Date,
  endDate: Date,
  batchHours: number,
  targetTable: string,
): Batch[] {
  const batches: Batch[] = [];
  let cursor = new Date(startDate);

  while (cursor < endDate) {
    const next = new Date(cursor);
    next.setUTCHours(next.getUTCHours() + batchHours);
    const batchEnd = next > endDate ? endDate : next;

    const startStr = formatChDateTime(cursor);
    const endStr = formatChDateTime(batchEnd);

    const sql = `INSERT INTO ${targetTable}
SELECT
  project_id,
  profile_id,
  name,
  toStartOfDay(created_at) AS event_date,
  countState() AS event_count,
  minState(created_at) AS first_event_time,
  maxState(created_at) AS last_event_time,
  sumState(duration) AS total_duration
FROM events
WHERE created_at >= toDateTime('${startStr}')
  AND created_at <  toDateTime('${endStr}')
  AND profile_id != device_id
GROUP BY project_id, profile_id, name, event_date`;

    batches.push({ startTime: startStr, endTime: endStr, sql });
    cursor = batchEnd;
  }

  return batches;
}

function generatePropertyBatches(
  startDate: Date,
  endDate: Date,
  batchHours: number,
  targetTable: string,
): Batch[] {
  const batches: Batch[] = [];
  let cursor = new Date(startDate);

  while (cursor < endDate) {
    const next = new Date(cursor);
    next.setUTCHours(next.getUTCHours() + batchHours);
    const batchEnd = next > endDate ? endDate : next;

    const startStr = formatChDateTime(cursor);
    const endStr = formatChDateTime(batchEnd);

    const sql = `INSERT INTO ${targetTable}
SELECT
  project_id,
  profile_id,
  name,
  property_key,
  property_value,
  toStartOfDay(created_at) AS event_date,
  countState() AS event_count,
  minState(created_at) AS first_event_time,
  maxState(created_at) AS last_event_time
FROM events
ARRAY JOIN mapKeys(properties) AS property_key, mapValues(properties) AS property_value
WHERE created_at >= toDateTime('${startStr}')
  AND created_at <  toDateTime('${endStr}')
  AND profile_id != device_id
  AND property_key != ''
  AND property_value != ''
GROUP BY project_id, profile_id, name, property_key, property_value, event_date`;

    batches.push({ startTime: startStr, endTime: endStr, sql });
    cursor = batchEnd;
  }

  return batches;
}

async function hasEventsInRange(start: Date, end: Date): Promise<boolean> {
  const result = await chMigrationClient.query({
    query: `
      SELECT count() AS c
      FROM events
      WHERE created_at >= toDateTime('${formatChDateTime(start)}')
        AND created_at <  toDateTime('${formatChDateTime(end)}')
        AND profile_id != device_id
    `,
    format: 'JSONEachRow',
  });
  const rows = await result.json<{ c: string }>();
  return Number(rows[0]?.c ?? 0) > 0;
}

async function executeBatches(label: string, batches: Batch[]): Promise<void> {
  const total = batches.length;
  const startedAt = Date.now();
  let completed = 0;

  console.log('');
  console.log(`🚀 ${label}: executing ${total} batches`);

  for (const batch of batches) {
    const t0 = Date.now();
    await runClickhouseMigrationCommands([batch.sql]);
    completed++;

    const logEvery = Math.max(1, Math.ceil(total / 10));
    if (completed % logEvery === 0 || completed === total) {
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      const pct = Math.round((completed / total) * 100);
      const lastSec = Math.round((Date.now() - t0) / 1000);
      console.log(
        `   [${pct}%] ${completed}/${total}  last=${lastSec}s  elapsed=${elapsedSec}s  (${batch.startTime} → ${batch.endTime})`,
      );
    }
  }
}

export async function up() {
  const isClustered = getIsCluster();
  const isDryRun = process.argv.includes('--dry');

  const days = Number.parseInt(getArg('days') ?? String(DEFAULT_DAYS), 10);
  const batchHours = Number.parseInt(
    getArg('batch-hours') ?? String(DEFAULT_BATCH_HOURS),
    10,
  );

  const endDate = new Date();
  endDate.setUTCMinutes(0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - days);

  const summaryTarget = resolveTargetTable(
    TABLE_NAMES.profile_event_summary_mv,
    isClustered,
  );
  const propertyTarget = resolveTargetTable(
    TABLE_NAMES.profile_event_property_summary_mv,
    isClustered,
  );

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 Cohort MV backfill');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Window:      ${formatChDateTime(startDate)} → ${formatChDateTime(endDate)} (${days} days)`);
  console.log(`   Batch size:  ${batchHours} hour${batchHours === 1 ? '' : 's'}`);
  console.log(`   Clustered:   ${isClustered}`);
  console.log(`   Summary MV:  ${summaryTarget}`);
  console.log(`   Property MV: ${propertyTarget}`);
  console.log(`   Mode:        ${isDryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const hasEvents = await hasEventsInRange(startDate, endDate);
  if (!hasEvents) {
    console.log('');
    console.log('⚠️  No identified events found in window — skipping backfill.');
    return;
  }

  const summaryBatches = generateSummaryBatches(
    startDate,
    endDate,
    batchHours,
    summaryTarget,
  );
  const propertyBatches = generatePropertyBatches(
    startDate,
    endDate,
    batchHours,
    propertyTarget,
  );

  if (isDryRun) {
    console.log('');
    console.log(`🔍 DRY RUN — ${summaryBatches.length} summary batches, ${propertyBatches.length} property batches`);
    console.log('');
    console.log('── Sample batch (profile_event_summary_mv) ──');
    console.log(summaryBatches[0]?.sql);
    console.log('');
    console.log('── Sample batch (profile_event_property_summary_mv) ──');
    console.log(propertyBatches[0]?.sql);
    return;
  }

  await executeBatches('profile_event_summary_mv', summaryBatches);
  await executeBatches('profile_event_property_summary_mv', propertyBatches);

  console.log('');
  console.log('✅ Backfill complete.');
}

export async function down() {
  console.log('⚠️  No down migration — backfill writes MV state, not schema.');
  console.log('   If a clean slate is needed, DROP + CREATE the two MVs and re-run.');
}
