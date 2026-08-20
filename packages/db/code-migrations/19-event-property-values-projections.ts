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
 *    migration skips re-materializing a projection only when it already
 *    exists AND system.mutations records a completed MATERIALIZE for it —
 *    presence alone could be a crashed earlier attempt's ADD, and if
 *    mutation state can't be read the migration materializes anyway
 *    (idempotent; redundant work beats a silent skip).
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

// Token-boundary match so a similarly named projection (epv_keys_v2) can
// never satisfy the checks — substring/LIKE matching would.
const nameBoundary = (name: string) =>
  new RegExp(`${name}([^A-Za-z0-9_]|$)`);

async function existingProjections(storage: string): Promise<Set<string>> {
  const res = await chMigrationClient.query({
    query: `SHOW CREATE TABLE \`${storage}\``,
    format: 'JSONEachRow',
  });
  const [row] = await res.json<{ statement: string }>();
  return new Set(
    PROJECTIONS.filter((p) =>
      nameBoundary(`PROJECTION ${p.name}`).test(row?.statement ?? ''),
    ).map((p) => p.name),
  );
}

async function materializedProjections(
  storage: string,
  isClustered: boolean,
): Promise<Set<string>> {
  try {
    // Clustered: a completed mutation on the connected host doesn't prove
    // the other hosts finished (or even received) theirs — require every
    // host in the cluster to report one, per projection.
    const source = isClustered
      ? `clusterAllReplicas('{cluster}', system.mutations)`
      : 'system.mutations';
    // (hostName(), tcpPort()) rather than hostName() alone: multiple
    // replicas on one machine share a hostname, and collapsing them could
    // count an incomplete replica as done.
    const res = await chMigrationClient.query({
      query: `SELECT concat(hostName(), ':', toString(tcpPort())) AS host, command FROM ${source}
              WHERE database = currentDatabase() AND table = '${storage}'
                AND command LIKE '%MATERIALIZE PROJECTION%'
                AND is_done = 1`,
      format: 'JSONEachRow',
    });
    const rows = await res.json<{ host: string; command: string }>();

    let totalHosts = 1;
    if (isClustered) {
      const hostsRes = await chMigrationClient.query({
        query: `SELECT countDistinct((hostName(), tcpPort())) AS c FROM clusterAllReplicas('{cluster}', system.one)`,
        format: 'JSONEachRow',
      });
      const [hostsRow] = await hostsRes.json<{ c: string | number }>();
      totalHosts = Number(hostsRow?.c ?? 0);
      if (totalHosts === 0) {
        return new Set();
      }
    }

    return new Set(
      PROJECTIONS.filter((p) => {
        const matcher = nameBoundary(`MATERIALIZE PROJECTION ${p.name}`);
        const hosts = new Set(
          rows.filter((r) => matcher.test(r.command)).map((r) => r.host),
        );
        return hosts.size >= totalHosts;
      }).map((p) => p.name),
    );
  } catch {
    // Can't verify (e.g. no grant on system.mutations / cluster functions) —
    // materialize; the mutations are idempotent and redundant work beats a
    // silent skip.
    return new Set();
  }
}

export async function up() {
  const isClustered = getIsCluster();
  const storage = await resolveStorageTable(isClustered);
  const tbl = `\`${storage}\``;
  const onCluster = isClustered ? " ON CLUSTER '{cluster}'" : '';

  // Skip a projection's backfill only when it exists AND a completed
  // MATERIALIZE mutation is on record (a manual pre-apply, see header) —
  // presence alone could be a crashed earlier attempt's ADD.
  const existing = await existingProjections(storage);
  const materialized = await materializedProjections(storage, isClustered);

  await runClickhouseMigrationCommands([
    `ALTER TABLE ${tbl}${onCluster} MODIFY SETTING deduplicate_merge_projection_mode = 'rebuild'`,
    ...PROJECTIONS.map(
      (p) =>
        `ALTER TABLE ${tbl}${onCluster} ADD PROJECTION IF NOT EXISTS ${p.name} (${p.def})`,
    ),
    ...PROJECTIONS.filter(
      (p) => !(existing.has(p.name) && materialized.has(p.name)),
    ).map(
      (p) => `ALTER TABLE ${tbl}${onCluster} MATERIALIZE PROJECTION ${p.name}`,
    ),
  ]);
}

export async function down() {
  const isClustered = getIsCluster();
  const storage = await resolveStorageTable(isClustered);
  const tbl = `\`${storage}\``;
  const onCluster = isClustered ? " ON CLUSTER '{cluster}'" : '';

  await runClickhouseMigrationCommands([
    ...PROJECTIONS.map(
      (p) => `ALTER TABLE ${tbl}${onCluster} DROP PROJECTION IF EXISTS ${p.name}`,
    ),
    // Restore the engine default ('throw'). Safe here because this down()
    // just dropped the only projections on the table; if you've added your
    // own projections to it, keep 'rebuild'.
    `ALTER TABLE ${tbl}${onCluster} MODIFY SETTING deduplicate_merge_projection_mode = 'throw'`,
  ]);
}
