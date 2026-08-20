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
 *  - The migration ADDs the projections and submits MATERIALIZE PROJECTION
 *    for existing parts by default. The mutations are asynchronous (the
 *    migration doesn't block on them) and idempotent; queries stay correct
 *    over mixed parts while they run — ClickHouse uses the projection where
 *    it exists and the base table elsewhere. Fresh installs no-op. Progress:
 *
 *      SELECT * FROM system.mutations WHERE command LIKE '%epv_%';
 *
 *  - These mutations rewrite projection data for every part, so deployments
 *    with a very large MV that want to control WHEN the backfill runs can
 *    apply the setting + ADD PROJECTION + MATERIALIZE PROJECTION statements
 *    manually before upgrading (off-peak), against the storage table. The
 *    migration detects pre-applied projections via SHOW CREATE TABLE and
 *    skips re-materializing them.
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

async function preAppliedProjections(storage: string): Promise<Set<string>> {
  const res = await chMigrationClient.query({
    query: `SHOW CREATE TABLE \`${storage}\``,
    format: 'JSONEachRow',
  });
  const [row] = await res.json<{ statement: string }>();
  return new Set(
    PROJECTIONS.filter((p) =>
      row?.statement.includes(`PROJECTION ${p.name}`),
    ).map((p) => p.name),
  );
}

export async function up() {
  const isClustered = getIsCluster();
  const storage = await resolveStorageTable(isClustered);
  const tbl = `\`${storage}\``;
  const onCluster = isClustered ? " ON CLUSTER '{cluster}'" : '';

  // Pre-existing projections mean the deployment applied ADD + MATERIALIZE
  // manually ahead of the upgrade (see header) — don't rewrite every part's
  // projection data again.
  const preApplied = await preAppliedProjections(storage);

  await runClickhouseMigrationCommands([
    `ALTER TABLE ${tbl}${onCluster} MODIFY SETTING deduplicate_merge_projection_mode = 'rebuild'`,
    ...PROJECTIONS.map(
      (p) =>
        `ALTER TABLE ${tbl}${onCluster} ADD PROJECTION IF NOT EXISTS ${p.name} (${p.def})`,
    ),
    ...PROJECTIONS.filter((p) => !preApplied.has(p.name)).map(
      (p) => `ALTER TABLE ${tbl}${onCluster} MATERIALIZE PROJECTION ${p.name}`,
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
