import {
  chMigrationClient,
  createTable,
  getTableKeys,
  runClickhouseMigrationCommands,
} from '../clickhouse/migration';
import { type CodeMigrationEnv, getIsCluster, writeSqlDump } from './helpers';

/**
 * Rebuilds `sessions` with `id` at the end of the sort key.
 *
 * VersionedCollapsingMergeTree cancels a +1 against a −1 that shares the sort
 * key and version. Without `id` in the key, two sessions of one project that
 * start in the same millisecond are indistinguishable to a merge, so one
 * session's −1 can cancel the other's +1 and both end up with wrong rows.
 * ClickHouse cannot add an existing column to a sort key in place, hence the
 * rebuild.
 *
 * Order of operations:
 *   1. Create the new table.
 *   2. Swap it in with EXCHANGE TABLES, which is atomic, so ingestion writes
 *      to it from then on and nothing written during the copy is lost, even
 *      with workers running. When clustered only the `_replicated` tables are
 *      swapped: the `sessions` Distributed table points at
 *      `sessions_replicated` by name.
 *   3. Copy the old table in, newest day first, so recent dashboards fill in
 *      first. A −1 written after the swap still collapses against the copied
 *      +1 it cancels: collapsing does not depend on insert order.
 *
 * The copy keeps one row per session, the +1 at its highest version. That
 * repairs sessions the old sort key already corrupted, and sessions that got
 * a duplicated +1 from a retried insert. A session that lost its latest +1 to
 * a collision comes back at its last surviving version. A session that lost
 * every row stays missing; its events are untouched.
 *
 * Each day is one INSERT. A session's rows share `created_at`, so they never
 * straddle a batch, and a day bounds the GROUP BY memory on the initiator.
 *
 * The old table stays as `sessions_<SUFFIX>`. Drop it once the copy is
 * verified (Σ sign per session = 1):
 *   Non-clustered: DROP TABLE sessions_<SUFFIX>
 *   Clustered:     DROP TABLE sessions_<SUFFIX> ON CLUSTER '{cluster}';
 *                  DROP TABLE sessions_<SUFFIX>_replicated ON CLUSTER '{cluster}'
 *
 * Safe to rerun after a failure at any step: the swap steps are skipped once
 * the live table has the new sort key, and a day's copy only inserts sessions
 * whose Σ sign in the new table is still below 1. That sum survives merges, so
 * a session already copied (1) is skipped, while one that is missing or only
 * has a −1/+1 pair written after the swap (0) is copied.
 *
 * Swapping first is safe for sessions because nothing on the write path reads
 * them back from ClickHouse; the session buffer keeps its state in Redis.
 */

const SUFFIX = '20261019';
const NEW_TABLE = `sessions_new_${SUFFIX}`;
const OLD_TABLE = `sessions_${SUFFIX}`;
const DISTRIBUTION_HASH =
  'cityHash64(project_id, toString(toStartOfHour(created_at)))';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const COLUMNS = [
  '`id` String',
  '`project_id` String CODEC(ZSTD(3))',
  '`profile_id` String CODEC(ZSTD(3))',
  '`device_id` String CODEC(ZSTD(3))',
  '`groups` Array(String) DEFAULT [] CODEC(ZSTD(3))',
  '`created_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
  '`ended_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
  '`is_bounce` Bool',
  '`entry_origin` LowCardinality(String)',
  '`entry_path` String CODEC(ZSTD(3))',
  '`exit_origin` LowCardinality(String)',
  '`exit_path` String CODEC(ZSTD(3))',
  '`screen_view_count` Int32',
  '`revenue` Float64',
  '`event_count` Int32',
  '`duration` UInt32',
  '`country` LowCardinality(FixedString(2))',
  '`region` LowCardinality(String)',
  '`city` String',
  '`longitude` Nullable(Float32) CODEC(Gorilla(4), LZ4)',
  '`latitude` Nullable(Float32) CODEC(Gorilla(4), LZ4)',
  '`device` LowCardinality(String)',
  '`brand` LowCardinality(String)',
  '`model` LowCardinality(String)',
  '`browser` LowCardinality(String)',
  '`browser_version` LowCardinality(String)',
  '`os` LowCardinality(String)',
  '`os_version` LowCardinality(String)',
  '`utm_medium` String CODEC(ZSTD(3))',
  '`utm_source` String CODEC(ZSTD(3))',
  '`utm_campaign` String CODEC(ZSTD(3))',
  '`utm_content` String CODEC(ZSTD(3))',
  '`utm_term` String CODEC(ZSTD(3))',
  '`referrer` String CODEC(ZSTD(3))',
  '`referrer_name` String CODEC(ZSTD(3))',
  '`referrer_type` LowCardinality(String)',
  '`sign` Int8',
  '`version` UInt64',
];

const COLUMN_NAMES = COLUMNS.map((column) => column.split('`')[1] ?? '');
const GROUP_KEY = new Set(['project_id', 'id']);

/**
 * Aliases are prefixed so they do not shadow the source columns inside
 * argMax(); INSERT … (columns) SELECT maps by position, not by name.
 */
function latestVersionSelect(column: string) {
  if (GROUP_KEY.has(column)) {
    return column;
  }
  if (column === 'sign') {
    return '1 AS v_sign';
  }
  if (column === 'version') {
    return 'max(version) AS v_version';
  }
  return `argMax(${column}, version) AS v_${column}`;
}

function toDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayRange(day: string) {
  return `created_at >= toDateTime64('${day} 00:00:00', 3)
  AND created_at < toDateTime64('${day} 00:00:00', 3) + INTERVAL 1 DAY`;
}

/**
 * parallel_distributed_insert_select would run this whole statement on each
 * shard, where the GLOBAL subquery's unqualified table does not exist; it has
 * to run once, on the initiator, against the Distributed tables.
 */
function copyDaySql(source: string, day: string) {
  return `INSERT INTO sessions (${COLUMN_NAMES.join(', ')})
SELECT ${COLUMN_NAMES.map(latestVersionSelect).join(', ')}
FROM ${source}
WHERE sign = 1
  AND ${dayRange(day)}
  AND (project_id, id) GLOBAL NOT IN (
    SELECT project_id, id FROM sessions
    WHERE ${dayRange(day)}
    GROUP BY project_id, id
    HAVING sum(sign) >= 1
  )
GROUP BY project_id, id
SETTINGS insert_distributed_sync = 1, parallel_distributed_insert_select = 0`;
}

const local = (table: string, isClustered: boolean) =>
  isClustered ? `${table}_replicated` : table;

const onCluster = (isClustered: boolean) =>
  isClustered ? " ON CLUSTER '{cluster}'" : '';

/**
 * The statements still needed to put the new table in place, given what an
 * earlier, interrupted run may already have done.
 */
async function swapSqls(isClustered: boolean) {
  const tables = await getTableKeys();
  const live = tables.get(local('sessions', isClustered));
  const isSwapped = live?.sortingKey.includes('id') ?? false;
  const isRenamePending =
    isSwapped && tables.has(local(NEW_TABLE, isClustered));
  // The old table is only dropped by hand once a finished copy is verified.
  const isOldTableDropped =
    isSwapped && !isRenamePending && !tables.has(local(OLD_TABLE, isClustered));
  if (isOldTableDropped) {
    return { sqls: [], isSwapped, isCopyDone: true };
  }
  const cluster = onCluster(isClustered);
  const sqls: string[] = [];

  if (!isSwapped) {
    // Clustered, only the `_replicated` table is created: the existing
    // `sessions` Distributed table routes to whatever is named
    // sessions_replicated.
    sqls.push(
      ...createTable({
        name: NEW_TABLE,
        engine: 'VersionedCollapsingMergeTree(sign, version)',
        columns: COLUMNS,
        indices: ['INDEX idx_id id TYPE bloom_filter(0.01) GRANULARITY 1'],
        orderBy: ['project_id', 'toDate(created_at)', 'created_at', 'id'],
        partitionBy: 'toYYYYMM(created_at)',
        settings: { index_granularity: 8192 },
        distributionHash: DISTRIBUTION_HASH,
        replicatedVersion: '1',
        isClustered,
      }).slice(0, 1),
      `EXCHANGE TABLES ${local(NEW_TABLE, isClustered)} AND ${local('sessions', isClustered)}${cluster}`
    );
  }
  if (!isSwapped || isRenamePending) {
    sqls.push(
      `RENAME TABLE ${local(NEW_TABLE, isClustered)} TO ${local(OLD_TABLE, isClustered)}${cluster}`
    );
  }
  if (isClustered) {
    sqls.push(`CREATE TABLE IF NOT EXISTS ${OLD_TABLE}${cluster} AS ${OLD_TABLE}_replicated
ENGINE = Distributed('{cluster}', currentDatabase(), ${OLD_TABLE}_replicated, ${DISTRIBUTION_HASH})`);
  }
  return { sqls, isSwapped, isCopyDone: false };
}

async function getDaysToCopy(source: string) {
  const response = await chMigrationClient.query({
    query: `SELECT toString(min(toDate(created_at))) AS first_day FROM ${source} WHERE created_at > '1970-01-01'`,
    format: 'JSONEachRow',
  });
  const [row] = await response.json<{ first_day: string }>();
  const firstDay = row?.first_day;
  if (!firstDay || firstDay.startsWith('1970')) {
    return [];
  }

  const first = Date.parse(`${firstDay}T00:00:00Z`);
  // Through tomorrow (UTC) so rows stamped slightly ahead are still copied.
  const last =
    Date.parse(`${toDay(new Date())}T00:00:00Z`) + MILLISECONDS_PER_DAY;
  const dayCount = (last - first) / MILLISECONDS_PER_DAY + 1;
  return Array.from({ length: dayCount }, (_, index) =>
    toDay(new Date(last - index * MILLISECONDS_PER_DAY))
  );
}

/** Runs in the background once the api is up; see the rerun notes above. */
export const online = true;

export async function up(env: CodeMigrationEnv) {
  const isClustered = getIsCluster(env);
  const isDry = process.argv.includes('--dry');
  const swap = await swapSqls(isClustered);
  if (swap.isCopyDone) {
    return;
  }

  if (!isDry) {
    await runClickhouseMigrationCommands(swap.sqls);
  }

  // A dry run has not swapped anything, so the old rows are still in
  // `sessions` unless an earlier run already moved them.
  const source = isDry && !swap.isSwapped ? 'sessions' : OLD_TABLE;
  const copySqls = (await getDaysToCopy(source)).map((day) =>
    copyDaySql(OLD_TABLE, day)
  );

  // The swap already ran, so a failed dump must not stop the copy; in a dry
  // run the dump is the whole output.
  try {
    writeSqlDump(import.meta.url, [...swap.sqls, ...copySqls]);
  } catch (error) {
    if (isDry) {
      throw error;
    }
    console.warn(
      'Could not write the SQL dump; continuing with the copy',
      error
    );
  }

  if (!isDry) {
    await runClickhouseMigrationCommands(copySqls);
  }
}
