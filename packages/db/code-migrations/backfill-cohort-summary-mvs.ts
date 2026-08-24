import { TABLE_NAMES } from '../src/clickhouse/client';
import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Backfill the re-keyed cohort summary MVs from migration 20 with history.
 *
 *   - event_profile_summary_mv
 *   - event_property_profile_summary_mv
 *
 * Both are created with populate: false, so they only index events inserted
 * after CREATE. This feeds them everything before that point.
 *
 * NOT a numbered migration on purpose: migrate.ts only auto-runs files whose
 * name starts with a number, so this can never execute inside the migration
 * container, where an eviction mid-run would force a full re-run. Run it
 * supervised:
 *
 *   CLICKHOUSE_URL=... jiti packages/db/code-migrations/backfill-cohort-summary-mvs.ts --until='YYYY-MM-DD hh:mm:ss'
 *
 * RESTART SAFETY
 * AggregatingMergeTree is not idempotent under re-insert: countState rows
 * merge additively, so re-running a range double counts. The safe unit of
 * retry is the MONTH, because batches are aligned to the tables' toYYYYMM
 * partitions. If a month fails or is interrupted, re-run just that month
 * with --replace, which drops the month's partition on the target first.
 *
 * --until is REQUIRED (except with --dry). Pass the CREATE time of the MVs
 * in UTC: events after that are already indexed by the live trigger, so
 * backfilling past it double counts the overlap. Find it with:
 *   SELECT metadata_modification_time FROM system.tables
 *   WHERE name = 'event_profile_summary_mv'
 *
 * Flags:
 *   --dry              Print the per-month plan and the first batch; run nothing.
 *   --from=YYYYMM      First month (default: month of min(created_at) in events).
 *   --to=YYYYMM        Last month (default: current month).
 *   --until=DATETIME   Upper bound on created_at (see above).
 *   --batch-days=N     Days per INSERT within a month (default 2).
 *   --parallel=N       Concurrent batches (default 2).
 *   --replace          DROP PARTITION on the target before each month (retry mode).
 *   --only=summary|property   Backfill just one of the two tables.
 */

const DEFAULT_BATCH_DAYS = 2;
const DEFAULT_PARALLEL = 2;

// Spill the per-batch GROUP BY rather than OOM on the ARRAY JOIN fan-out;
// max_insert_threads parallelises the part-building stage, which is
// otherwise single-threaded and leaves cores idle during a backfill.
const INSERT_SETTINGS =
  'SETTINGS max_bytes_before_external_group_by = 4294967296, max_insert_threads = 8';

type Batch = { label: string; sql: string };

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function resolveTarget(base: string, isClustered: boolean): string {
  return isClustered ? `${base}_replicated` : base;
}

function monthStart(yyyymm: number): string {
  const y = Math.floor(yyyymm / 100);
  const m = yyyymm % 100;
  return `${y}-${String(m).padStart(2, '0')}-01 00:00:00`;
}

function nextMonth(yyyymm: number): number {
  const y = Math.floor(yyyymm / 100);
  const m = yyyymm % 100;
  return m === 12 ? (y + 1) * 100 + 1 : yyyymm + 1;
}

// Column projections and the identity filter are byte-identical to the MV
// definitions in migration 20; only the time bounds differ.
function summarySelect(start: string, end: string): string {
  return `SELECT
  project_id,
  profile_id,
  name,
  toStartOfDay(created_at) AS event_date,
  countState() AS event_count,
  minState(created_at) AS first_event_time,
  maxState(created_at) AS last_event_time,
  sumState(duration) AS total_duration
FROM events
WHERE created_at >= toDateTime('${start}')
  AND created_at <  toDateTime('${end}')
  AND profile_id != device_id
GROUP BY project_id, profile_id, name, event_date`;
}

function propertySelect(start: string, end: string): string {
  return `SELECT
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
WHERE created_at >= toDateTime('${start}')
  AND created_at <  toDateTime('${end}')
  AND profile_id != device_id
  AND property_key != ''
  AND property_value != ''
GROUP BY project_id, profile_id, name, property_key, property_value, event_date`;
}

function monthBatches(
  month: number,
  until: string,
  batchDays: number,
  target: string,
  select: (start: string, end: string) => string,
): Batch[] {
  const batches: Batch[] = [];
  const start = new Date(`${monthStart(month).replace(' ', 'T')}Z`);
  const monthEnd = new Date(`${monthStart(nextMonth(month)).replace(' ', 'T')}Z`);
  const untilDate = new Date(`${until.replace(' ', 'T')}Z`);
  const end = monthEnd < untilDate ? monthEnd : untilDate;

  let cursor = new Date(start);
  while (cursor < end) {
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + batchDays);
    const batchEnd = next > end ? end : next;
    const s = cursor.toISOString().slice(0, 19).replace('T', ' ');
    const e = batchEnd.toISOString().slice(0, 19).replace('T', ' ');
    batches.push({
      label: `${s} -> ${e}`,
      sql: `INSERT INTO ${target}\n${select(s, e)}\n${INSERT_SETTINGS}`,
    });
    cursor = batchEnd;
  }
  return batches;
}

// N workers drain the batch list in order. Batches are independent time
// ranges, so ordering does not matter; parts merge asynchronously.
async function runPool(
  batches: Batch[],
  parallel: number,
  onDone: (batch: Batch, seconds: number) => void,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(parallel, batches.length)) }, async () => {
      while (next < batches.length) {
        const batch = batches[next++]!;
        const t0 = Date.now();
        await chMigrationClient.command({ query: batch.sql });
        onDone(batch, Math.round((Date.now() - t0) / 1000));
      }
    }),
  );
}

async function getMinMonth(): Promise<number> {
  const res = await chMigrationClient.query({
    query: 'SELECT toYYYYMM(min(created_at)) AS m FROM events',
    format: 'JSONEachRow',
  });
  const rows = await res.json<{ m: string }>();
  return Number(rows[0]?.m ?? 0);
}

export async function up() {
  const isClustered = getIsCluster();
  const isDry = process.argv.includes('--dry');
  const replace = process.argv.includes('--replace');
  const only = getArg('only');
  const batchDays = Number.parseInt(getArg('batch-days') ?? String(DEFAULT_BATCH_DAYS), 10);
  const parallel = Number.parseInt(getArg('parallel') ?? String(DEFAULT_PARALLEL), 10);

  const now = new Date();
  const currentMonth = now.getUTCFullYear() * 100 + (now.getUTCMonth() + 1);
  const fromMonth = Number.parseInt(getArg('from') ?? String(await getMinMonth()), 10);
  const toMonth = Number.parseInt(getArg('to') ?? String(currentMonth), 10);
  const until = getArg('until');

  if (!until && !isDry) {
    console.error(
      '❌ --until=<MV CREATE time, UTC> is required. Without it the window already indexed by the live MV trigger is double counted.',
    );
    process.exit(1);
  }
  const untilStr = until ?? now.toISOString().slice(0, 19).replace('T', ' ');

  const targets: Array<{ label: string; table: string; select: (s: string, e: string) => string }> = [];
  if (only !== 'property') {
    targets.push({
      label: TABLE_NAMES.event_profile_summary_mv,
      table: resolveTarget(TABLE_NAMES.event_profile_summary_mv, isClustered),
      select: summarySelect,
    });
  }
  if (only !== 'summary') {
    targets.push({
      label: TABLE_NAMES.event_property_profile_summary_mv,
      table: resolveTarget(TABLE_NAMES.event_property_profile_summary_mv, isClustered),
      select: propertySelect,
    });
  }

  const months: number[] = [];
  for (let m = fromMonth; m <= toMonth; m = nextMonth(m)) {
    months.push(m);
  }

  console.log('');
  console.log('📦 Cohort summary MV backfill');
  console.log(`   Months:     ${fromMonth} -> ${toMonth} (${months.length})`);
  console.log(`   Until:      ${untilStr}`);
  console.log(`   Batch days: ${batchDays}   Parallel: ${parallel}   Replace: ${replace}`);
  console.log(`   Targets:    ${targets.map((t) => t.label).join(', ')}`);
  console.log(`   Mode:       ${isDry ? 'DRY RUN' : 'EXECUTE'}`);

  if (isDry) {
    for (const target of targets) {
      const sample = monthBatches(months[0]!, untilStr, batchDays, target.table, target.select);
      console.log(`\n-- ${target.label}: ${sample.length} batches for ${months[0]} --`);
      console.log(sample[0]?.sql);
    }
    return;
  }

  const startedAt = Date.now();
  for (const target of targets) {
    console.log(`\n🚀 ${target.label}`);
    for (const month of months) {
      const batches = monthBatches(month, untilStr, batchDays, target.table, target.select);
      if (batches.length === 0) {
        continue;
      }
      if (replace) {
        await runClickhouseMigrationCommands([
          `ALTER TABLE ${target.table} DROP PARTITION '${month}'`,
        ]);
      }
      const t0 = Date.now();
      await runPool(batches, parallel, (batch, seconds) => {
        console.log(`      · ${batch.label} (${seconds}s)`);
      });
      console.log(
        `   ✅ ${month} in ${Math.round((Date.now() - t0) / 1000)}s (${batches.length} batches, elapsed=${Math.round((Date.now() - startedAt) / 1000)}s)`,
      );
    }
  }
  console.log('\n✅ Backfill complete.');
}

// Allow direct execution.
if (import.meta.url === `file://${process.argv[1]}`) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
