import { TABLE_NAMES } from '../src/clickhouse/client';
import {
  dropTable,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Drop the profile-keyed cohort summary MVs superseded by migration 20.
 *
 *   - profile_event_summary_mv           (created in migration 13)
 *   - profile_event_property_summary_mv  (created in migration 14)
 *
 * Migration 20 created replacements keyed for the queries that read them,
 * migration 21 filled them with history, and cohort.service has read the new
 * tables since. The old pair kept receiving inserts so the change stayed
 * revertible by pointer while the new tables were verified. Nothing reads
 * them now, so they are two MV triggers firing on every event insert for no
 * consumer.
 *
 * Clustered installs have two objects per MV: `<name>` is the Distributed
 * table and `<name>_replicated` is the materialized view itself. The
 * Distributed table goes first so nothing can route a read at a view that is
 * mid-drop. Dropping the view takes its implicit `.inner_id.<uuid>` storage
 * with it, so there is no third name to clean up.
 *
 * Deliberately one-way. The aggregated history goes with the tables, and
 * rerunning migrations 13 and 14 would only bring back empty structure, so a
 * down() would be a rollback in name only. If you need them back, those two
 * migrations hold the definitions and migration 15 the backfill.
 */

const SUPERSEDED_MVS = [
  TABLE_NAMES.profile_event_summary_mv,
  TABLE_NAMES.profile_event_property_summary_mv,
];

export async function up() {
  const isClustered = getIsCluster();

  const sqls = SUPERSEDED_MVS.flatMap((name) =>
    isClustered
      ? [dropTable(name, true), dropTable(`${name}_replicated`, true)]
      : [dropTable(name, false)],
  );

  await runClickhouseMigrationCommands(sqls);
}
