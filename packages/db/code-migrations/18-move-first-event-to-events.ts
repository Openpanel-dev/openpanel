import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Move backfilled events from events_tmp3 -> events, ONE DATE at a time,
 * optionally scoped to a single project_id.
 *
 * Defaults to `first_install` (the deviceUID-deduped fresh-install marker; one row per
 * device, keyed on the anon profile_id). events_tmp3 holds the Databricks backfill. We copy
 * it back into `events` per-date so each INSERT stays small/safe, dedup with `LIMIT 1 BY`,
 * and skip dates already present (idempotent re-runs).
 *
 * `--name=<event>` selects which event to move (default `first_install`). Pass
 * `--name=_first_event` only to re-run the legacy backfill.
 *
 * `--project=<id>` scopes the source count / idempotency-guard / insert / verify to that
 * project. This is REQUIRED once `events` already holds this event for ANOTHER project
 * — e.g. after dashreels is loaded, moving shortreels needs `--project=shortreels` so the
 * guard doesn't see dashreels rows and skip every date. Omit it to move all projects.
 *
 * Inspired by migration 14 (per-date move) and 16 (LIMIT 1 BY dedup).
 *
 * Usage (first_install, dashreels full backfill range 2025-06-01 .. 2026-06-23):
 *   Dry run:
 *     pnpm migrate:deploy:code -- 18 --cluster --dry --date=2026-06-22 --project=dashreels --no-record
 *   Execute one date:
 *     pnpm migrate:deploy:code -- 18 --cluster --date=2026-06-22 --project=dashreels --no-record
 *
 *   All dates (shell loop):
 *     d=2025-06-01; while [ "$d" != 2026-06-24 ]; do \
 *       pnpm migrate:deploy:code -- 18 --cluster --date=$d --project=dashreels --no-record; \
 *       d=$(date -I -d "$d + 1 day"); done
 */

const SRC_TABLE = 'events_tmp3';
const DST_TABLE = 'events';
const DEFAULT_EVENT_NAME = 'first_install';
const DEDUP_KEY =
  'project_id, name, device_id, profile_id, session_id, created_at';

function parseArgs() {
  const args = process.argv;
  const dateArg = args.find((a: string) => a.startsWith('--date='));
  const projectArg = args.find((a: string) => a.startsWith('--project='));
  const nameArg = args.find((a: string) => a.startsWith('--name='));

  const date = dateArg ? dateArg.split('=')[1]! : null;
  const project = projectArg ? projectArg.split('=')[1]! : null;
  // Event to move. Defaults to 'first_install' (the deviceUID-deduped fresh-install
  // marker). Pass --name=_first_event to re-run the legacy backfill if ever needed.
  const eventName = nameArg ? nameArg.split('=')[1]! : DEFAULT_EVENT_NAME;

  return {
    date,
    project,
    eventName,
    isCluster: getIsCluster(),
    isDry: args.includes('--dry'),
  };
}

export async function up() {
  const { date, project, isDry, eventName } = parseArgs();

  // This is a MANUAL, per-date migration. When the automatic `migrate:deploy` loop imports
  // it WITHOUT --date, no-op gracefully so it can never crash the deploy migration job.
  if (!date) {
    console.log(
      '[18-move-first-event] No --date provided — manual per-date migration, skipping.',
    );
    console.log(
      '   Run via: pnpm migrate:deploy:code -- 18 --cluster --date=2026-06-22 --project=dashreels --no-record',
    );
    return;
  }

  // Optional project scope. REQUIRED once `events` holds another project's _first_event,
  // otherwise the idempotency guard sees those rows and skips every date.
  const projectFilter = project ? `AND project_id = '${project}'` : '';

  console.log('='.repeat(60));
  console.log(`  MOVE ${eventName}: events_tmp3 -> events`);
  console.log(`  Date:    ${date}`);
  console.log(`  Project: ${project ?? '(all)'}`);
  console.log(`  Mode:    ${isDry ? 'DRY RUN' : 'EXECUTE'}`);
  console.log('='.repeat(60));

  // Step 0: source counts in events_tmp3 for this date (+ project)
  console.log(`\n[Step 0] ${SRC_TABLE} ${eventName} for ${date}:`);
  const srcResult = await chMigrationClient.query({
    query: `
      SELECT
        count() as total,
        uniq(${DEDUP_KEY}) as unique_events
      FROM ${SRC_TABLE}
      WHERE name = '${eventName}' ${projectFilter} AND toDate(created_at) = '${date}'`,
    format: 'JSONEachRow',
  });
  const srcData = await srcResult.json<{
    total: string;
    unique_events: string;
  }>();
  const srcTotal = Number(srcData[0]?.total ?? 0);
  const srcUnique = Number(srcData[0]?.unique_events ?? 0);

  console.log(`  Total:  ${srcTotal.toLocaleString()}`);
  console.log(
    `  Unique: ${srcUnique.toLocaleString()} (dupes: ${(srcTotal - srcUnique).toLocaleString()})`,
  );

  if (srcTotal === 0) {
    console.log('\n  Nothing to move for this date.');
    return;
  }

  // Step 1: idempotency guard - already present in events (for THIS project)?
  const existingResult = await chMigrationClient.query({
    query: `
      SELECT count() as total
      FROM ${DST_TABLE}
      WHERE name = '${eventName}' ${projectFilter} AND toDate(created_at) = '${date}'`,
    format: 'JSONEachRow',
  });
  const existing = Number(
    (await existingResult.json<{ total: string }>())[0]?.total ?? 0,
  );
  if (existing > 0) {
    console.log(
      `\n  WARNING: ${DST_TABLE} already has ${existing.toLocaleString()} ${eventName} for ${date}${project ? ` (project ${project})` : ''}.`,
    );
    console.log(
      '     Skipping to avoid duplicates. Delete them first if you intend to re-copy.',
    );
    return;
  }

  if (isDry) {
    console.log('\n[DRY RUN] SQL that would execute:');
    console.log(`
  INSERT INTO ${DST_TABLE}
  SELECT * FROM ${SRC_TABLE}
  WHERE name = '${eventName}' ${projectFilter} AND toDate(created_at) = '${date}'
  LIMIT 1 BY ${DEDUP_KEY}
  SETTINGS max_memory_usage = 40000000000, max_execution_time = 18000;`);
    return;
  }

  // Step 2: copy this date (deduped) into events
  console.log(
    `\n[Step 2] Copying ${srcUnique.toLocaleString()} ${eventName} into ${DST_TABLE}...`,
  );
  await runClickhouseMigrationCommands([
    `INSERT INTO ${DST_TABLE}
     SELECT * FROM ${SRC_TABLE}
     WHERE name = '${eventName}' ${projectFilter} AND toDate(created_at) = '${date}'
     LIMIT 1 BY ${DEDUP_KEY}
     SETTINGS
       max_memory_usage = 40000000000,
       max_execution_time = 18000`,
  ]);

  // Step 3: verify
  console.log(`\n[Step 3] Verifying ${DST_TABLE} count for ${date}:`);
  const dstResult = await chMigrationClient.query({
    query: `
      SELECT count() as total
      FROM ${DST_TABLE}
      WHERE name = '${eventName}' ${projectFilter} AND toDate(created_at) = '${date}'`,
    format: 'JSONEachRow',
  });
  const dstTotal = Number(
    (await dstResult.json<{ total: string }>())[0]?.total ?? 0,
  );

  console.log(`\n  ${SRC_TABLE} unique: ${srcUnique.toLocaleString()}`);
  console.log(`  ${DST_TABLE} now:    ${dstTotal.toLocaleString()}`);
  console.log(
    dstTotal === srcUnique
      ? '  MATCH'
      : '  MISMATCH - investigate before continuing',
  );

  console.log('\n' + '='.repeat(60));
  console.log('  MOVE COMPLETE');
  console.log('='.repeat(60));
}

export async function down() {
  console.log('No down migration');
}
