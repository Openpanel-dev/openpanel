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
 * That expansion is also what caps the win. Measured on the restored
 * production copy, busiest anchor project (`chatpaper`, 6,224,393 session
 * rows, 736 candidate granules across 9 parts), five sessions x three runs:
 *
 *   without the index   3,124-3,431 ms   6,224,393 rows   1.44 GB read
 *   with the index        170-342 ms   294,885-524,267 rows   70-124 MB read
 *
 * 13x, not the ~90x the granule counts suggest: the bloom filter selects
 * 5-10 of 736 granules, PrimaryKeyExpand widens that back to 26-45 because
 * each selected granule drags its whole primary-key range through all 9
 * parts. `event.details` is the same query plus a 11-22 ms events lookup, so
 * it moves with it (3,140 ms -> ~250 ms).
 *
 * ADD INDEX is metadata-only and covers newly written parts; MATERIALIZE
 * INDEX backfills the existing ones. The mutation is asynchronous (this
 * migration does not block on it) and idempotent, reads only the `id` column
 * and writes small .idx files — it does not rewrite table data. Progress:
 *
 *   SELECT * FROM system.mutations WHERE command LIKE '%idx_id%';
 *
 * Cost of the backfill, measured over 29,401,478 rows in 14 parts: the ALTER
 * returns in under 50 ms and the mutation completed 1.1-1.2 s later on four
 * consecutive runs (1122 / 1161 / 1172 / 1176 ms from submit to is_done). It
 * only reads `id`, so it is bounded by one column, not by the table.
 *
 * ROLLBACK. The index is droppable and nothing reads it explicitly, so
 * reverting is a single statement — `down()` below, or by hand:
 *
 *   Non-clustered:
 *     ALTER TABLE sessions DROP INDEX IF EXISTS idx_id;
 *   Clustered:
 *     ALTER TABLE sessions_replicated ON CLUSTER '{cluster}' DROP INDEX IF EXISTS idx_id;
 *
 * DROP INDEX removes the .idx files from every part (0.5-0.9 s here, also
 * measured), so nothing has to be re-materialised to undo it. Re-applying
 * afterwards means running this migration again, i.e. ADD INDEX followed by
 * MATERIALIZE INDEX — the two statements below, in that order. Queries keep
 * answering correctly with or without the index; only the row count they
 * scan changes.
 */

const INDEX_NAME = 'idx_id';

/**
 * 0.01 to match `events.idx_profile_id`, the existing index over the same
 * shape of column (a high-cardinality opaque id).
 *
 * Size: 35.20 MiB over 29,401,478 rows, measured on the restored production
 * copy after this migration ran — ~9.8 KiB per 8192-row granule, against a
 * ~4 MiB estimate that scaled `events.idx_profile_id` (40.95 MiB / 321 M
 * rows) by row count. `id` is unique per row, so every granule's filter is
 * saturated; `profile_id` repeats heavily inside a granule. A bloom filter's
 * size follows granule count, not the rows behind it.
 *
 * Tightening the rate does not pay for itself: 0.001 costs 52.79 MiB for
 * 73-179 ms, 0.0001 costs 66.87 MiB for 75-128 ms, and even a
 * false-positive-free index still reads 90,106 rows per lookup because
 * PrimaryKeyExpand walks one true granule through all 9 parts.
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
