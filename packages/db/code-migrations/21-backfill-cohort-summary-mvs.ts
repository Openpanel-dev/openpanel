import { TABLE_NAMES } from '../src/clickhouse/client';
import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Fill the re-keyed cohort summary MVs from migration 20 with history.
 *
 *   - event_profile_summary_mv
 *   - event_property_profile_summary_mv
 *
 * Both are created with populate: false, so the live trigger only indexes
 * events inserted after CREATE. Everything older has to be aggregated from
 * the events table, which is what this does.
 *
 * REBUILD, NOT APPEND
 * Each month's partition is dropped and rebuilt from events rather than
 * appended to. These are AggregatingMergeTree tables, so an append that
 * overlaps rows the trigger already wrote would double count them; a
 * rebuild cannot, because the trigger's copies for that month are dropped
 * first. That makes the work idempotent: an interrupted run is resumed by
 * running it again, and a month can be redone at any time.
 *
 * It also removes the need to know when the MVs were created. Each month is
 * bounded by a now64(3) read immediately after that month's DROP: rows older
 * than the bound had their trigger-written copies dropped and are rebuilt
 * here, rows newer are left to the trigger. Each event is counted once.
 *
 * The bound has to be per month, not per run. A run can take hours, and the
 * current month is dropped at the end of it, so a bound captured at the
 * start would delete every row the trigger wrote while the run was going and
 * then decline to rebuild them. Taking it after each drop narrows the
 * exposure to the round trip between the drop and the read, in which an
 * arriving event can be counted twice. Pass --until to cut somewhere fixed
 * instead, which is what a supervised re-run of a closed month wants.
 *
 * The tradeoff a rebuild makes is visibility: while a month is being
 * rebuilt its partition is incomplete, so a cohort computed in that window
 * under-counts that month. It converges as soon as the month finishes.
 *
 * AUTOMATIC BY DEFAULT
 * This runs as a normal migration so a new install ends up with working
 * cohorts without anyone reading this file. Because the rebuild is
 * idempotent, an evicted migration pod is safe: the migration is not
 * recorded, and the next boot redoes it.
 *
 * Rebuilding the full history of a large events table is not something to
 * start unattended, though, so it steps aside above
 * COHORT_BACKFILL_MAX_EVENTS rows (default 100,000,000, roughly the point
 * where this stops being minutes) and prints the command to run by hand.
 * Raise the variable, or pass --force, to run it anyway.
 *
 * MANUAL USE
 * The same file is the supervised tool. Run it directly to control when
 * the work happens, or to redo part of it:
 *
 *   CLICKHOUSE_URL=... jiti packages/db/code-migrations/21-backfill-cohort-summary-mvs.ts
 *
 * Flags:
 *   --dry              Print the plan and the first batch; run nothing.
 *   --force            Ignore COHORT_BACKFILL_MAX_EVENTS.
 *   --from=YYYYMM      First month (default: month of min(created_at)).
 *   --to=YYYYMM        Last month (default: current month).
 *   --until=DATETIME   Fixed upper bound on created_at for every month
 *                      (default: now64(3) taken after each month's drop).
 *   --batch-days=N     Days per INSERT within a month (default 2).
 *   --parallel=N       Concurrent batches (default 2).
 *   --only=summary|property   Rebuild just one of the two tables.
 *
 * CLUSTERS
 * Reads and writes go through the Distributed tables, so one run from one
 * node covers every shard. The one statement that cannot be distributed is
 * DROP PARTITION, which the Distributed engine rejects outright, so that
 * goes ON CLUSTER against the local table instead. Still a single run.
 */

const DEFAULT_BATCH_DAYS = 2;
const DEFAULT_PARALLEL = 2;
const DEFAULT_MAX_EVENTS = 100_000_000;

// Spill the per-batch GROUP BY rather than OOM on the ARRAY JOIN fan-out;
// max_insert_threads parallelises the part-building stage, which is
// otherwise single-threaded and leaves cores idle during a rebuild.
// distributed_foreground_insert so a finished batch means the rows have
// actually landed on their shards, not that they were queued for delivery.
const INSERT_SETTINGS = `SETTINGS
  max_bytes_before_external_group_by = 4294967296,
  max_insert_threads = 8,
  distributed_foreground_insert = 1`;

type Batch = { label: string; sql: string };

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function getPositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`expected a positive integer, got "${value}"`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`expected a positive integer, got "${value}"`);
  }
  return parsed;
}

// DROP PARTITION is the one statement that cannot go through the Distributed
// table: the engine rejects partitioning outright. ON CLUSTER against the
// local table reaches every shard in a single statement instead.
function dropPartition(
  table: string,
  month: number,
  isClustered: boolean,
): string {
  return isClustered
    ? `ALTER TABLE ${table}_replicated ON CLUSTER '{cluster}' DROP PARTITION '${month}'`
    : `ALTER TABLE ${table} DROP PARTITION '${month}'`;
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
FROM ${TABLE_NAMES.events}
WHERE created_at >= toDateTime64('${start}', 3)
  AND created_at <  toDateTime64('${end}', 3)
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
FROM ${TABLE_NAMES.events}
ARRAY JOIN mapKeys(properties) AS property_key, mapValues(properties) AS property_value
WHERE created_at >= toDateTime64('${start}', 3)
  AND created_at <  toDateTime64('${end}', 3)
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
  const monthEnd = new Date(
    `${monthStart(nextMonth(month)).replace(' ', 'T')}Z`,
  );
  const untilDate = new Date(`${until.replace(' ', 'T')}Z`);
  const end = monthEnd < untilDate ? monthEnd : untilDate;

  let cursor = new Date(start);
  while (cursor < end) {
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + batchDays);
    const batchEnd = next > end ? end : next;
    // Keep milliseconds: created_at is DateTime64(3) and the final batch end
    // is the month's bound, so truncating to whole seconds would drop every
    // event in the boundary second after its trigger row had been dropped.
    const s = cursor.toISOString().slice(0, 23).replace('T', ' ');
    const e = batchEnd.toISOString().slice(0, 23).replace('T', ' ');
    batches.push({
      label: `${s} -> ${e}`,
      sql: `INSERT INTO ${target}\n${select(s, e)}\n${INSERT_SETTINGS}`,
    });
    cursor = batchEnd;
  }
  return batches;
}

// N workers drain the batch list in order. Batches are independent time
// ranges within an already-dropped month, so ordering does not matter.
async function runPool(
  batches: Batch[],
  parallel: number,
  onDone: (batch: Batch, seconds: number) => void,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(parallel, batches.length)) },
      async () => {
        while (next < batches.length) {
          const batch = batches[next++]!;
          const startedAt = Date.now();
          await chMigrationClient.command({ query: batch.sql });
          onDone(batch, Math.round((Date.now() - startedAt) / 1000));
        }
      },
    ),
  );
}

async function scalar(query: string): Promise<string | undefined> {
  const res = await chMigrationClient.query({ query, format: 'JSONEachRow' });
  const rows = await res.json<Record<string, string>>();
  return rows[0] ? Object.values(rows[0])[0] : undefined;
}

export async function up() {
  const isClustered = getIsCluster();
  const isDry = process.argv.includes('--dry');
  const force = process.argv.includes('--force');
  const only = getArg('only');
  const batchDays = getPositiveInt(getArg('batch-days'), DEFAULT_BATCH_DAYS);
  const parallel = getPositiveInt(getArg('parallel'), DEFAULT_PARALLEL);
  const maxEvents = getPositiveInt(
    process.env.COHORT_BACKFILL_MAX_EVENTS,
    DEFAULT_MAX_EVENTS,
  );

  const totalEvents = Number(
    (await scalar(`SELECT count() AS c FROM ${TABLE_NAMES.events}`)) ?? 0,
  );
  if (totalEvents === 0) {
    console.log('📦 Cohort summary MVs: no events to aggregate, nothing to do');
    return;
  }
  if (totalEvents > maxEvents && !force && !isDry) {
    console.log('');
    console.log(
      `⏭️  Cohort summary MVs: skipping the automatic rebuild (${totalEvents.toLocaleString()} events > COHORT_BACKFILL_MAX_EVENTS=${maxEvents.toLocaleString()}).`,
    );
    console.log(
      '   Cohorts compute from partial history until this is run. Run it when it suits you:',
    );
    console.log(
      '     CLICKHOUSE_URL=... jiti packages/db/code-migrations/21-backfill-cohort-summary-mvs.ts',
    );
    console.log(
      '   It rebuilds month by month and is safe to interrupt and re-run.',
    );
    console.log('');
    return;
  }

  // A fixed --until applies to every month. Without one, each month takes its
  // own bound straight after its drop (see the header) so a long run cannot
  // lose the rows the trigger wrote while it was running. Read from
  // ClickHouse rather than the local clock to stay in created_at's clock
  // domain.
  const fixedUntil = getArg('until');
  const planningUntil =
    fixedUntil ?? (await scalar('SELECT toString(now64(3)) AS t'));
  if (!planningUntil) {
    throw new Error('could not resolve the rebuild upper bound');
  }

  const currentMonth = Number(
    await scalar(
      `SELECT toString(toYYYYMM(toDateTime64('${planningUntil}', 3))) AS m`,
    ),
  );
  const fromMonth = getPositiveInt(
    getArg('from') ??
      (await scalar(
        `SELECT toString(toYYYYMM(min(created_at))) AS m FROM ${TABLE_NAMES.events}`,
      )),
    currentMonth,
  );
  const toMonth = getPositiveInt(getArg('to'), currentMonth);

  const targets: Array<{
    label: string;
    table: string;
    select: (start: string, end: string) => string;
  }> = [];
  if (only !== 'property') {
    targets.push({
      label: TABLE_NAMES.event_profile_summary_mv,
      table: TABLE_NAMES.event_profile_summary_mv,
      select: summarySelect,
    });
  }
  if (only !== 'summary') {
    targets.push({
      label: TABLE_NAMES.event_property_profile_summary_mv,
      table: TABLE_NAMES.event_property_profile_summary_mv,
      select: propertySelect,
    });
  }

  const months: number[] = [];
  for (let m = fromMonth; m <= toMonth; m = nextMonth(m)) {
    months.push(m);
  }

  console.log('');
  console.log('📦 Cohort summary MV rebuild');
  console.log(`   Events:     ${totalEvents.toLocaleString()}`);
  console.log(`   Months:     ${fromMonth} -> ${toMonth} (${months.length})`);
  console.log(`   Until:      ${fixedUntil ?? 'per month, after each drop'}`);
  console.log(`   Batch days: ${batchDays}   Parallel: ${parallel}`);
  console.log(`   Targets:    ${targets.map((t) => t.label).join(', ')}`);
  console.log(`   Clustered:  ${isClustered}`);
  console.log(`   Mode:       ${isDry ? 'DRY RUN' : 'EXECUTE'}`);

  if (isDry) {
    for (const target of targets) {
      const sample = monthBatches(
        months[0]!,
        planningUntil,
        batchDays,
        target.table,
        target.select,
      );
      console.log(
        `\n-- ${target.label}: ${sample.length} batches for ${months[0]} --`,
      );
      console.log(dropPartition(target.table, months[0]!, isClustered));
      console.log(sample[0]?.sql);
    }
    return;
  }

  const startedAt = Date.now();
  for (const target of targets) {
    console.log(`\n🚀 ${target.label}`);
    for (const month of months) {
      // Drop first, then take the bound, so anything the trigger writes from
      // here on is kept by the trigger and excluded from the rebuild.
      await runClickhouseMigrationCommands([
        dropPartition(target.table, month, isClustered),
      ]);
      const until =
        fixedUntil ?? (await scalar('SELECT toString(now64(3)) AS t'));
      if (!until) {
        throw new Error(`${month}: could not resolve the rebuild upper bound`);
      }
      const batches = monthBatches(
        month,
        until,
        batchDays,
        target.table,
        target.select,
      );
      if (batches.length === 0) {
        continue;
      }
      const monthStartedAt = Date.now();
      await runPool(batches, parallel, (batch, seconds) => {
        console.log(`      · ${batch.label} (${seconds}s)`);
      });
      console.log(
        `   ✅ ${month} in ${Math.round((Date.now() - monthStartedAt) / 1000)}s (${batches.length} batches, elapsed=${Math.round((Date.now() - startedAt) / 1000)}s)`,
      );
    }
  }
  console.log('\n✅ Rebuild complete.');
}

// Allow direct execution for the supervised path.
if (import.meta.url === `file://${process.argv[1]}`) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
