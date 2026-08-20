import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Data-skipping index on events.profile_id.
 *
 * The events table sorts by (project_id, toDate(created_at), created_at,
 * name) and has no index on profile_id, so every profile-scoped query — the
 * profile panel, per-profile event lists and counts, profile-filtered
 * charts — scans the project's entire events slice to find one profile's
 * rows. A bloom_filter index lets both `profile_id = X` and
 * `profile_id IN (...)` prune to the few granules that can contain that
 * profile; on our deployment (~1.5B events) profile pages went from
 * tens-of-seconds full scans to sub-second reads.
 *
 * ADD INDEX is metadata-only and covers newly written parts; existing parts
 * are backfilled by MATERIALIZE INDEX, which this migration submits by
 * default. The mutation is asynchronous (the migration doesn't block on it)
 * and idempotent, reads only the profile_id column, and writes small .idx
 * files — unlike a projection it does not rewrite table data. Progress:
 *
 *   SELECT * FROM system.mutations WHERE command LIKE '%idx_profile_id%';
 *
 * Deployments with very large events tables that want to control WHEN the
 * backfill runs can apply both statements manually before upgrading
 * (off-peak), targeting the same table this migration alters:
 *
 * Non-clustered:
 *   ALTER TABLE events ADD INDEX IF NOT EXISTS idx_profile_id profile_id TYPE bloom_filter(0.01) GRANULARITY 1;
 *   ALTER TABLE events MATERIALIZE INDEX idx_profile_id;
 *
 * Clustered:
 *   ... events_replicated ON CLUSTER '{cluster}' ...
 *
 * The migration detects the pre-applied index and skips re-materializing.
 * Fresh installs have no existing parts, so the mutation is a no-op.
 */

const INDEX_NAME = 'idx_profile_id';

async function hasIndex(table: string): Promise<boolean> {
  const res = await chMigrationClient.query({
    query: `SHOW CREATE TABLE ${table}`,
    format: 'JSONEachRow',
  });
  const [row] = await res.json<{ statement: string }>();
  return !!row?.statement.includes(INDEX_NAME);
}

export async function up() {
  const isClustered = getIsCluster();
  const table = isClustered ? 'events_replicated' : 'events';
  const onCluster = isClustered ? " ON CLUSTER '{cluster}'" : '';

  // A pre-existing index means the deployment ran ADD + MATERIALIZE manually
  // ahead of the upgrade (see header) — don't submit a redundant rebuild of
  // every part's index files.
  const preApplied = await hasIndex(table);

  const sqls = [
    `ALTER TABLE ${table}${onCluster} ADD INDEX IF NOT EXISTS ${INDEX_NAME} profile_id TYPE bloom_filter(0.01) GRANULARITY 1`,
  ];
  if (!preApplied) {
    sqls.push(
      `ALTER TABLE ${table}${onCluster} MATERIALIZE INDEX ${INDEX_NAME}`,
    );
  }

  await runClickhouseMigrationCommands(sqls);
}

export async function down() {
  const isClustered = getIsCluster();
  const table = isClustered ? 'events_replicated' : 'events';
  const onCluster = isClustered ? " ON CLUSTER '{cluster}'" : '';

  await runClickhouseMigrationCommands([
    `ALTER TABLE ${table}${onCluster} DROP INDEX IF EXISTS ${INDEX_NAME}`,
  ]);
}
