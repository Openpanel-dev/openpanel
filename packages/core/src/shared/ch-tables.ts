// The physical ClickHouse table names core reads and writes, plus the two
// cluster helpers that derive from them.
//
// These live in `@openpanel/db/src/clickhouse/client.ts` too, and that module
// is where the migrations (`@openpanel/db`'s `code-migrations/`) still take
// them from — but importing it constructs a real ClickHouse client and a real
// pino logger at module load, which is the cost every `load*` lazy loader in
// this package existed to defer, and it is a value import of `@openpanel/db`
// from core, which `core-uses-ctx-not-db-internals` now forbids. Core takes the
// map, not the client: `ch` itself is always `ctx.ch` / `deps.ch`.
//
// The duplication is policed, not trusted: `ch-tables.parity.test.ts` asserts
// this map and @openpanel/db's are identical, so a table added on one side and
// not the other fails the suite rather than a query.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';

export const TABLE_NAMES = {
  events: 'events',
  profiles: 'profiles',
  alias: 'profile_aliases',
  self_hosting: 'self_hosting',
  events_bots: 'events_bots',
  dau_mv: 'dau_mv',
  event_names_mv: 'distinct_event_names_mv',
  event_property_values_mv: 'event_property_values_mv',
  cohort_events_mv: 'cohort_events_mv',
  sessions: 'sessions',
  events_imports: 'events_imports',
  session_replay_chunks: 'session_replay_chunks',
  gsc_daily: 'gsc_daily',
  gsc_pages_daily: 'gsc_pages_daily',
  gsc_queries_daily: 'gsc_queries_daily',
  groups: 'groups',
  cohort_members: 'cohort_members',
  cohort_metadata: 'cohort_metadata',
  // Superseded by the two event_*_summary_mv entries below and dropped in
  // migration 24. Kept because migrations 13, 14 and 15 still name them.
  profile_event_summary_mv: 'profile_event_summary_mv',
  // Same content as the two MVs above, keyed for the cohort criteria that
  // read them (event + window first, profile last) rather than by profile.
  // See migration 20.
  event_profile_summary_mv: 'event_profile_summary_mv',
  event_property_profile_summary_mv: 'event_property_profile_summary_mv',
  profile_event_property_summary_mv: 'profile_event_property_summary_mv',
};

/**
 * The mutation target as a SQL fragment: `<name>_replicated ON CLUSTER
 * '{cluster}'` when clustered, the plain name otherwise. Clustered mode =
 * production (not self-hosted); non-clustered = self-hosted. The verdict is
 * `config.clickhouseClustered`, resolved once by the config loader from
 * CLICKHOUSE_CLUSTER and SELF_HOSTED.
 *
 * Built here rather than fed through `sql.id` because the clustered form is
 * not an identifier: the `ON CLUSTER` clause is literal template text, and
 * `'{cluster}'` is a ClickHouse *macro*, not a `{name:Type}` placeholder — it
 * carries no type suffix, so parameter substitution leaves it alone.
 */
export function replicatedTarget(
  clustered: boolean,
  tableName: string
): SqlFragment {
  if (clustered) {
    return sql`${sql.id(`${tableName}_replicated`)} ON CLUSTER '{cluster}'`;
  }
  return sql.id(tableName);
}

export function getReplicatedTableName(
  clustered: boolean,
  tableName: string
): string {
  if (clustered) {
    return `${tableName}_replicated ON CLUSTER '{cluster}'`;
  }
  return tableName;
}
