import { TABLE_NAMES } from '../src/clickhouse/client';
import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Aggregating projection for the property-key autocomplete dropdown.
 *
 * The key picker reads event_property_values_mv, which is ORDER BY
 * (project_id, name, property_key, property_value). Two shapes exist:
 *
 *   no event selected  -> WHERE project_id ... GROUP BY property_key
 *   event selected     -> WHERE project_id AND name ... GROUP BY property_key
 *
 * Neither is cheap on that sort key. The first can seek only to project_id
 * and must then aggregate the project's whole slice (on our deployment,
 * 1.57B rows to return ~6.4K distinct keys). The second prunes to the
 * event's slice, but that slice still holds every key AND every value for
 * the event — measured 120M rows read on average, p95 15.9s.
 *
 * One aggregating projection answers both:
 *
 *   epv_keys -> (project_id, name, property_key), max(created_at)
 *
 * With an event selected, (project_id, name) is a seekable prefix, so the
 * read prunes to that event's keys. With no event, the query's GROUP BY is
 * a subset of the projection's, so the optimizer still substitutes it and
 * aggregates over the (tiny) projection instead of the table — verified
 * with EXPLAIN for both shapes. The optimizer rewrites the existing picker
 * queries transparently; no application change.
 *
 * Sizing: the projection is one row per (project, event, key) — 30,212 rows
 * against a 1.637B-row MV on our deployment. Including `name` costs ~3.4x
 * the rows of a (project_id, property_key)-only projection while covering
 * the event-selected shape that one cannot serve at all (a projection is
 * only substitutable when it contains EVERY column the query references,
 * so any filter on `name` disqualifies a projection that lacks it).
 *
 * NOT included: a (project_id, property_key, property_value) projection for
 * the value picker. Its grain is 95.4% of the MV's row count — a near-
 * complete second copy of the table — and it can only serve value lookups
 * with no event selected, since the event-selected shape already gets a
 * full three-column prefix seek on the base table. Measured on our
 * deployment: 2 such queries in 30 days.
 *
 * Notes:
 *  - The projection lives on the MV's STORAGE table: the implicit
 *    `.inner_id.<uuid>` table on a single node, `<mv>_replicated` when
 *    clustered.
 *  - AggregatingMergeTree refuses ADD PROJECTION while
 *    deduplicate_merge_projection_mode is 'throw' (the default);
 *    'rebuild' keeps projections correct across dedup merges.
 *  - The migration ADDs the projection and submits MATERIALIZE PROJECTION
 *    for existing parts by default. The mutation is asynchronous (the
 *    migration doesn't block on it) and idempotent; queries stay correct
 *    over mixed parts while it runs — ClickHouse reads the projection from
 *    parts that have it and the base table from those that don't (observed
 *    in EXPLAIN as two read nodes). Fresh installs no-op. Progress:
 *
 *      SELECT * FROM system.mutations WHERE command LIKE '%epv_%';
 *
 *  - The mutation rewrites projection data for every part, so deployments
 *    with a very large MV that want to control WHEN the backfill runs can
 *    apply the setting + ADD PROJECTION + MATERIALIZE PROJECTION statements
 *    manually before upgrading (off-peak), against the storage table. The
 *    migration skips re-materializing only when the projection already
 *    exists AND system.mutations records a completed MATERIALIZE for it —
 *    presence alone could be a crashed earlier attempt's ADD, and if
 *    mutation state can't be read the migration materializes anyway
 *    (idempotent; redundant work beats a silent skip). Note that because
 *    ADD uses IF NOT EXISTS, a manual pre-apply must use the definition
 *    below verbatim — a same-named projection with a different grain would
 *    be kept as-is.
 */

const MV = TABLE_NAMES.event_property_values_mv;

const PROJECTIONS = [
  {
    name: 'epv_keys',
    def: 'SELECT project_id, name, property_key, max(created_at) AS created_at GROUP BY project_id, name, property_key',
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
