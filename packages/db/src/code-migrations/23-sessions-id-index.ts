import { runClickhouseMigrationCommands } from '../clickhouse/migration';
import { type CodeMigrationEnv, getIsCluster } from './helpers';

/**
 * Data-skipping index on sessions.id.
 *
 * `sessions` is VersionedCollapsingMergeTree(sign, version) ORDER BY
 * (project_id, toDate(created_at), created_at) — `id` is not in the sort key
 * at all. So `SELECT * FROM sessions FINAL WHERE id = ? AND project_id = ?`
 * (the session detail route loader, and the session half of event.details)
 * narrows on `project_id` only and then makes FINAL read and merge every
 * column of the project's entire slice to answer a single-row lookup.
 *
 * A bloom_filter on `id` prunes that to the granules that can contain the id.
 * The query text does not change; this is purely a physical-layout fix.
 *
 * FINAL stays correct under the pruning because ClickHouse expands a skip
 * index's granule selection back out to every granule intersecting those
 * granules' primary-key range before merging (the `PrimaryKeyExpand` step in
 * EXPLAIN indexes=1, on by default via use_skip_indexes_if_final_exact_mode).
 * Every version of a collapsed row is therefore still read, which matters
 * here: `id` is not in the sort key, so one session's rows can legitimately
 * sit in different granules.
 *
 * That expansion also caps the win: each selected granule drags its whole
 * primary-key range through every part, so the observed speedup (~13x on a
 * 6.2M-row project) is well short of the ~90x the raw granule count suggests.
 *
 * ADD INDEX is metadata-only and covers newly written parts; MATERIALIZE
 * INDEX backfills the existing ones. The mutation is asynchronous (this
 * migration does not block on it), idempotent, reads only the `id` column and
 * writes small .idx files — it does not rewrite table data. Progress:
 *
 *   SELECT * FROM system.mutations WHERE command LIKE '%idx_id%';
 *
 * ROLLBACK. The index is droppable and nothing reads it explicitly, so
 * reverting is a single statement — `down()` below, or by hand:
 *
 *   Non-clustered:
 *     ALTER TABLE sessions DROP INDEX IF EXISTS idx_id;
 *   Clustered:
 *     ALTER TABLE sessions_replicated ON CLUSTER '{cluster}' DROP INDEX IF EXISTS idx_id;
 *
 * Re-applying afterwards means running this migration again, i.e. ADD INDEX
 * followed by MATERIALIZE INDEX — the two statements below, in that order.
 * Queries keep answering correctly with or without the index; only the row
 * count they scan changes.
 */

const INDEX_NAME = 'idx_id';

/**
 * 0.01 to match `events.idx_profile_id`, the existing index over the same
 * shape of column (a high-cardinality opaque id).
 *
 * `id` is unique per row, so every granule's bloom filter is saturated,
 * unlike `profile_id` which repeats heavily inside a granule — a bloom
 * filter's size follows granule count, not the rows behind it, so this index
 * (35 MiB over 29.4M rows) comes out larger than a row-count-scaled estimate
 * from `events.idx_profile_id` would suggest.
 *
 * Tightening the rate does not pay for itself: it costs tens of MiB more for
 * a marginal drop in read time, and even a false-positive-free index still
 * pays PrimaryKeyExpand's cost of walking one true granule through every part.
 */
const FALSE_POSITIVE_RATE = 0.01;
const GRANULARITY = 1;

function targetTable(isClustered: boolean) {
  return isClustered ? 'sessions_replicated' : 'sessions';
}

function onCluster(isClustered: boolean) {
  return isClustered ? " ON CLUSTER '{cluster}'" : '';
}

export async function up(env: CodeMigrationEnv) {
  const isClustered = getIsCluster(env);
  const table = targetTable(isClustered);
  const cluster = onCluster(isClustered);

  await runClickhouseMigrationCommands([
    `ALTER TABLE ${table}${cluster} ADD INDEX IF NOT EXISTS ${INDEX_NAME} id TYPE bloom_filter(${FALSE_POSITIVE_RATE}) GRANULARITY ${GRANULARITY}`,
    `ALTER TABLE ${table}${cluster} MATERIALIZE INDEX ${INDEX_NAME}`,
  ]);
}

export async function down(env: CodeMigrationEnv) {
  const isClustered = getIsCluster(env);
  const table = targetTable(isClustered);
  const cluster = onCluster(isClustered);

  await runClickhouseMigrationCommands([
    `ALTER TABLE ${table}${cluster} DROP INDEX IF EXISTS ${INDEX_NAME}`,
  ]);
}
