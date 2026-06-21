import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';

/**
 * Per-device `_first_event` dedup infrastructure (going-forward pipeline).
 *
 * Background: `_first_event` is a synthetic, ONE-per-physical-device (`deviceUID`)
 * "first app open" marker — the clean denominator for install→login/trial funnels.
 * The historical rows (~19.7M, ≤ Jun 2026) were backfilled from Databricks gold via
 * migration 18. This migration adds the structure that keeps it correct for NEW
 * devices going forward, WITHOUT ever re-emitting a `_first_event` for a device that
 * already has one.
 *
 * This migration is ADDITIVE and IDEMPOTENT (safe in the auto-deploy loop):
 *   1. device_first_seen            — AggregatingMergeTree, one row/device: min(created_at)
 *                                     first-seen ts + argMin(profile_id) install profile.
 *                                     (No backfill needed — going-forward only; the dedup
 *                                      guard below + the backlog backfill handle history.)
 *   2. first_event_dedup_device     — ReplacingMergeTree guard: every deviceUID that
 *                                     ALREADY has a `_first_event`. The single source of
 *                                     truth every `_first_event` insert anti-joins.
 *   3. first_event_dedup_device_mv  — keeps the guard current: fires ONLY on `_first_event`
 *                                     inserts (cheap), reads the device_id COLUMN (no Map).
 *   4. SEED the guard from the existing `_first_event` rows so the going-forward cron /
 *      backlog backfill never re-emit them. Idempotent (ReplacingMergeTree + count guard).
 *
 * NOT in this migration (deliberately):
 *   - device_first_seen_mv (the per-EVENT MV that reads properties['deviceUID']). It is the
 *     only change that touches the hot ingest path, so it is attached separately, after
 *     validating its SELECT and with ingest monitored.
 *   - The recurring generator (worker cron or Databricks daily) and the Jun-6→now backlog
 *     backfill — those are a scheduled job / an 18-style data move, not schema.
 *
 * Aiven note: plain DDL (no ON CLUSTER) auto-converts to Replicated* and propagates to all
 * replicas here — matching how `first_event_dedup` and these objects already exist in prod.
 */

const DDL: string[] = [
  // 1. per-device first-seen summary (fed later by device_first_seen_mv; empty for now)
  `CREATE TABLE IF NOT EXISTS device_first_seen
(
    project_id      LowCardinality(String),
    deviceUID       String,
    first_ts        AggregateFunction(min, DateTime64(3)),
    install_profile AggregateFunction(argMin, String, DateTime64(3))
)
ENGINE = AggregatingMergeTree()
ORDER BY (project_id, deviceUID)`,

  // 2. the dedup guard: one row per deviceUID that already has a _first_event
  `CREATE TABLE IF NOT EXISTS first_event_dedup_device
(
    project_id LowCardinality(String),
    deviceUID  String
)
ENGINE = ReplacingMergeTree()
ORDER BY (project_id, deviceUID)`,

  // 3. keep the guard current — fires ONLY on _first_event inserts, reads the column (no Map)
  `CREATE MATERIALIZED VIEW IF NOT EXISTS first_event_dedup_device_mv TO first_event_dedup_device AS
SELECT project_id, device_id AS deviceUID
FROM events
WHERE name = '_first_event'`,
];

export async function up() {
  console.log('='.repeat(60));
  console.log('  19 — per-device _first_event dedup infrastructure');
  console.log('='.repeat(60));

  // Step 1: create the 3 objects (idempotent)
  console.log('\n[Step 1] Creating device_first_seen + dedup guard + dedup MV...');
  await runClickhouseMigrationCommands(DDL);
  console.log('  Created (or already existed).');

  // Step 2: seed the guard from existing _first_event — but only if empty, so re-runs
  // never re-scan events. ReplacingMergeTree makes a re-seed harmless anyway.
  const guardCount = Number(
    (
      await (
        await chMigrationClient.query({
          query: 'SELECT count() AS total FROM first_event_dedup_device',
          format: 'JSONEachRow',
        })
      ).json<{ total: string }>()
    )[0]?.total ?? 0,
  );

  if (guardCount > 0) {
    console.log(
      `\n[Step 2] Guard already has ${guardCount.toLocaleString()} rows — skipping seed.`,
    );
  } else {
    console.log(
      '\n[Step 2] Seeding guard from existing _first_event (device_id column, one-time scan)...',
    );
    await runClickhouseMigrationCommands([
      `INSERT INTO first_event_dedup_device
       SELECT DISTINCT project_id, device_id
       FROM events
       WHERE name = '_first_event' AND device_id != ''
       SETTINGS max_execution_time = 1800, max_memory_usage = 40000000000`,
    ]);

    const seeded = Number(
      (
        await (
          await chMigrationClient.query({
            query: 'SELECT count() AS total FROM first_event_dedup_device',
            format: 'JSONEachRow',
          })
        ).json<{ total: string }>()
      )[0]?.total ?? 0,
    );
    console.log(`  Seeded guard: ${seeded.toLocaleString()} devices.`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('  19 COMPLETE');
  console.log('  Next (separate, deliberate): attach device_first_seen_mv,');
  console.log('  run the Jun-6→now backlog backfill, wire the recurring generator.');
  console.log('='.repeat(60));
}

export async function down() {
  await runClickhouseMigrationCommands([
    'DROP VIEW IF EXISTS first_event_dedup_device_mv',
    'DROP TABLE IF EXISTS first_event_dedup_device',
    'DROP TABLE IF EXISTS device_first_seen',
  ]);
}
