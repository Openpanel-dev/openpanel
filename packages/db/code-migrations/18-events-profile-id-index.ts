import { runClickhouseMigrationCommands } from '../src/clickhouse/migration';
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
 * This migration only ADDs the index — a cheap, metadata-level, idempotent
 * operation that applies to newly written parts. For a deployment whose
 * events table already holds data, existing parts must also be built —
 * targeting the same table this migration alters:
 *
 * Non-clustered:
 *   ALTER TABLE events MATERIALIZE INDEX idx_profile_id;
 *
 * Clustered:
 *   ALTER TABLE events_replicated ON CLUSTER '{cluster}' MATERIALIZE INDEX idx_profile_id;
 *
 * which is a heavy one-time mutation (it reads the whole profile_id column,
 * though it only writes small .idx files — unlike a projection it does not
 * rewrite table data). It is deliberately NOT part of the migration so it
 * can't re-run on every deploy; run it once, off-peak, and watch
 * system.mutations until is_done = 1. Fresh installs need nothing.
 */

export async function up() {
  const isClustered = getIsCluster();
  const table = isClustered ? 'events_replicated' : 'events';
  const onCluster = isClustered ? " ON CLUSTER '{cluster}'" : '';

  await runClickhouseMigrationCommands([
    `ALTER TABLE ${table}${onCluster} ADD INDEX IF NOT EXISTS idx_profile_id profile_id TYPE bloom_filter(0.01) GRANULARITY 1`,
  ]);
}

export async function down() {
  const isClustered = getIsCluster();
  const table = isClustered ? 'events_replicated' : 'events';
  const onCluster = isClustered ? " ON CLUSTER '{cluster}'" : '';

  await runClickhouseMigrationCommands([
    `ALTER TABLE ${table}${onCluster} DROP INDEX IF EXISTS idx_profile_id`,
  ]);
}
