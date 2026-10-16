import { TABLE_NAMES } from '../clickhouse/client';
import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../clickhouse/migration';
import { type CodeMigrationEnv, getIsCluster } from './helpers';

/**
 * Aggregating projection `epv_keys` for the property-key autocomplete dropdown.
 *
 * event_property_values_mv is ORDER BY (project_id, name, property_key,
 * property_value), so listing keys either aggregates a project's whole slice
 * (no event selected) or still reads every key and value of one event
 * (event selected; p95 15.9s on a 1.6B-row deployment). A projection on
 * (project_id, name, property_key) serves both shapes: with an event the
 * (project_id, name) prefix is seekable, without one the query's GROUP BY is
 * a subset of the projection's, so the optimizer still substitutes it.
 * A projection is only substitutable when it contains every column the query
 * references, so `name` must be part of it.
 *
 * A (project_id, property_key, property_value) projection for the value
 * picker is deliberately absent: its grain is 95% of the MV's row count, and
 * it would only serve value lookups with no event selected (rare).
 *
 * Notes:
 *  - The projection lives on the MV's storage table, the implicit
 *    `.inner_id.<uuid>` table, in every topology. Clustered, `<mv>` is a
 *    Distributed table and `<mv>_replicated` is itself a MaterializedView,
 *    which rejects MODIFY SETTING / ADD PROJECTION with NOT_IMPLEMENTED.
 *  - AggregatingMergeTree refuses ADD PROJECTION while
 *    deduplicate_merge_projection_mode is 'throw' (the default);
 *    'rebuild' keeps projections correct across dedup merges.
 *  - MATERIALIZE PROJECTION is an asynchronous, idempotent mutation the
 *    migration does not wait for. Queries stay correct over mixed parts while
 *    it runs. Progress (mutations are recorded against `.inner_id.<uuid>`,
 *    not the MV name):
 *
 *      SELECT * FROM system.mutations WHERE command LIKE '%epv_%';
 *
 *  - The mutation rewrites projection data for every part. Deployments with a
 *    very large MV can run the setting + ADD PROJECTION + MATERIALIZE
 *    PROJECTION statements manually off-peak before upgrading, against the
 *    storage table:
 *
 *      SELECT concat('.inner_id.', toString(uuid)) FROM system.tables
 *      WHERE database = currentDatabase()
 *        AND name = 'event_property_values_mv_replicated'; -- drop the
 *                    suffix when not clustered
 *
 *    The migration skips re-materializing only when the projection exists AND
 *    system.mutations records a completed MATERIALIZE; presence alone could
 *    be a crashed earlier attempt's ADD. If mutation state can't be read it
 *    materializes anyway (redundant work beats a silent skip). Because ADD
 *    uses IF NOT EXISTS, a manual pre-apply must use the definition below
 *    verbatim; a same-named projection with a different grain is kept as-is.
 */

const MV = TABLE_NAMES.event_property_values_mv;

const PROJECTIONS = [
  {
    name: 'epv_keys',
    def: 'SELECT project_id, name, property_key, max(created_at) AS created_at GROUP BY project_id, name, property_key',
  },
];

// `CREATE ... ON CLUSTER` propagates the initiator's uuid, so the inner
// table has the same name on every node and a single ON CLUSTER ALTER
// reaches all of them.
async function resolveStorageTable(isClustered: boolean): Promise<string> {
  const view = isClustered ? `${MV}_replicated` : MV;
  const res = await chMigrationClient.query({
    query: `SELECT concat('.inner_id.', toString(uuid)) AS t
            FROM system.tables WHERE database = currentDatabase() AND name = '${view}'`,
    format: 'JSONEachRow',
  });
  const rows = await res.json<{ t: string }>();
  if (!rows[0]?.t) {
    throw new Error(`${view}: inner storage table not found`);
  }
  return rows[0].t;
}

// Token-boundary match so a similarly named projection (epv_keys_v2) can
// never satisfy the checks — substring/LIKE matching would.
const nameBoundary = (name: string) => new RegExp(`${name}([^A-Za-z0-9_]|$)`);

async function existingProjections(storage: string): Promise<Set<string>> {
  const res = await chMigrationClient.query({
    query: `SHOW CREATE TABLE \`${storage}\``,
    format: 'JSONEachRow',
  });
  const [row] = await res.json<{ statement: string }>();
  return new Set(
    PROJECTIONS.filter((p) =>
      nameBoundary(`PROJECTION ${p.name}`).test(row?.statement ?? '')
    ).map((p) => p.name)
  );
}

async function materializedProjections(
  storage: string,
  isClustered: boolean
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
          rows.filter((r) => matcher.test(r.command)).map((r) => r.host)
        );
        return hosts.size >= totalHosts;
      }).map((p) => p.name)
    );
  } catch {
    // Can't verify (e.g. no grant on system.mutations / cluster functions) —
    // materialize; the mutations are idempotent and redundant work beats a
    // silent skip.
    return new Set();
  }
}

export async function up(env: CodeMigrationEnv) {
  const isClustered = getIsCluster(env);
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
        `ALTER TABLE ${tbl}${onCluster} ADD PROJECTION IF NOT EXISTS ${p.name} (${p.def})`
    ),
    ...PROJECTIONS.filter(
      (p) => !(existing.has(p.name) && materialized.has(p.name))
    ).map(
      (p) => `ALTER TABLE ${tbl}${onCluster} MATERIALIZE PROJECTION ${p.name}`
    ),
  ]);
}

export async function down(env: CodeMigrationEnv) {
  const isClustered = getIsCluster(env);
  const storage = await resolveStorageTable(isClustered);
  const tbl = `\`${storage}\``;
  const onCluster = isClustered ? " ON CLUSTER '{cluster}'" : '';

  await runClickhouseMigrationCommands([
    ...PROJECTIONS.map(
      (p) =>
        `ALTER TABLE ${tbl}${onCluster} DROP PROJECTION IF EXISTS ${p.name}`
    ),
    // Restore the engine default ('throw'). Safe here because this down()
    // just dropped the only projections on the table; if you've added your
    // own projections to it, keep 'rebuild'.
    `ALTER TABLE ${tbl}${onCluster} MODIFY SETTING deduplicate_merge_projection_mode = 'throw'`,
  ]);
}
