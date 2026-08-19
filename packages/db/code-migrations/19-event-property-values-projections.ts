import { TABLE_NAMES } from '../src/clickhouse/client';
import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Aggregating projections for the property autocomplete dropdowns.
 *
 * The property-key and property-value pickers read
 * event_property_values_mv, which is ORDER BY
 * (project_id, name, property_key, property_value). Neither picker query
 * can seek on that key: the project-wide key list has no `name` filter, and
 * the value lookup filters property_key, which sits behind `name`. Both
 * therefore scan the project's whole MV slice — on our deployment, 1.57B
 * rows read to return ~6.4K distinct keys.
 *
 * Two aggregating projections give those queries a key they can seek:
 *
 *   epv_keys   -> (project_id, property_key)                 max(created_at)
 *   epv_values -> (project_id, property_key, property_value) max(created_at)
 *
 * The optimizer rewrites the picker queries onto them transparently — no
 * application change, reads drop to a few thousand rows.
 *
 * Notes:
 *  - The projections live on the MV's STORAGE table: the implicit
 *    `.inner_id.<uuid>` table on a single node, `<mv>_replicated` when
 *    clustered.
 *  - AggregatingMergeTree refuses ADD PROJECTION while
 *    deduplicate_merge_projection_mode is 'throw' (the default);
 *    'rebuild' keeps projections correct across dedup merges.
 *  - This migration only ADDs the projections, which populate for newly
 *    written parts (and for old parts as background merges rewrite them).
 *    Queries stay correct over mixed parts — ClickHouse uses the projection
 *    where it exists and the base table elsewhere — so coverage improves
 *    over time on its own. To backfill existing parts immediately, run the
 *    heavy one-time mutations manually (they rewrite projection data for
 *    every part; off-peak, watch system.mutations until is_done = 1):
 *
 *      ALTER TABLE <storage> MATERIALIZE PROJECTION epv_keys;
 *      ALTER TABLE <storage> MATERIALIZE PROJECTION epv_values;
 */

const MV = TABLE_NAMES.event_property_values_mv;

const PROJECTIONS = [
  {
    name: 'epv_keys',
    def: 'SELECT project_id, property_key, max(created_at) AS created_at GROUP BY project_id, property_key',
  },
  {
    name: 'epv_values',
    def: 'SELECT project_id, property_key, property_value, max(created_at) AS created_at GROUP BY project_id, property_key, property_value',
  },
];

// The projection lives on the MV's storage table: the implicit inner table
// (`.inner_id.<uuid>`) on a single node, or `<mv>_replicated` when clustered.
async function resolveStorageTable(isClustered: boolean): Promise<string> {
  if (isClustered) {
    return `${MV}_replicated`;
  }
  const res = await chMigrationClient.query({
    query: `SELECT concat('.inner_id.', toString(uuid)) AS t
            FROM system.tables WHERE database = currentDatabase() AND name = '${MV}'`,
    format: 'JSONEachRow',
  });
  const rows = await res.json<{ t: string }>();
  if (!rows[0]?.t) {
    throw new Error(`${MV}: inner storage table not found`);
  }
  return rows[0].t;
}

export async function up() {
  const isClustered = getIsCluster();
  const storage = await resolveStorageTable(isClustered);
  const tbl = `\`${storage}\``;
  const onCluster = isClustered ? " ON CLUSTER '{cluster}'" : '';

  await runClickhouseMigrationCommands([
    `ALTER TABLE ${tbl}${onCluster} MODIFY SETTING deduplicate_merge_projection_mode = 'rebuild'`,
    ...PROJECTIONS.map(
      (p) =>
        `ALTER TABLE ${tbl}${onCluster} ADD PROJECTION IF NOT EXISTS ${p.name} (${p.def})`,
    ),
  ]);
}

export async function down() {
  const isClustered = getIsCluster();
  const storage = await resolveStorageTable(isClustered);
  const tbl = `\`${storage}\``;
  const onCluster = isClustered ? " ON CLUSTER '{cluster}'" : '';

  await runClickhouseMigrationCommands(
    PROJECTIONS.map(
      (p) => `ALTER TABLE ${tbl}${onCluster} DROP PROJECTION IF EXISTS ${p.name}`,
    ),
  );
}
