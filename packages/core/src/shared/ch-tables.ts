// The ClickHouse table names core reads and writes, plus two cluster helpers.
//
// Duplicated from `@openpanel/db/src/clickhouse/client.ts` because importing
// that constructs a real ClickHouse client and pino logger at module load.
// `ch-tables.parity.test.ts` asserts the two maps are identical.

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
  // migration 24; kept because migrations 13, 14 and 15 still name them.
  profile_event_summary_mv: 'profile_event_summary_mv',
  // Keyed for the cohort criteria that read them (event + window first,
  // profile last) rather than by profile.
  event_profile_summary_mv: 'event_profile_summary_mv',
  event_property_profile_summary_mv: 'event_property_profile_summary_mv',
  profile_event_property_summary_mv: 'profile_event_property_summary_mv',
};

/**
 * The mutation target as a SQL fragment: `<name>_replicated ON CLUSTER
 * '{cluster}'` when clustered, the plain name otherwise.
 *
 * Not fed through `sql.id`: `ON CLUSTER` is literal template text and
 * `'{cluster}'` is a ClickHouse macro, not a `{name:Type}` placeholder, so
 * parameter substitution leaves it alone.
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
