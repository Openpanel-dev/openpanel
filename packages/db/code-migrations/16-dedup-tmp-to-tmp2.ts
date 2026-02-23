import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Move events from events_tmp to events_tmp2 with dedup
 *
 * Reads from events_tmp, deduplicates using LIMIT 1 BY, writes to events_tmp2.
 * After all days are done, REPLACE PARTITION from events_tmp2 into events.
 *
 * Usage:
 *   Dry run:
 *     pnpm migrate:deploy:code -- 16 --cluster --dry --date=2026-01-01 --no-record
 *
 *   Execute:
 *     pnpm migrate:deploy:code -- 16 --cluster --date=2026-01-01 --no-record
 */

const DEDUP_KEY =
  'project_id, name, device_id, profile_id, session_id, created_at, path, properties';

const SRC_TABLE = 'events_tmp';
const DST_TABLE = 'events_tmp2';

function parseArgs() {
  const args = process.argv;
  const dateArg = args.find((a: string) => a.startsWith('--date='));

  if (!dateArg) {
    console.error('Missing required --date=YYYY-MM-DD argument');
    console.error('   Example: pnpm migrate:deploy:code -- 16 --cluster --date=2026-01-01 --no-record');
    process.exit(1);
  }

  const date = dateArg!.split('=')[1]!;

  return {
    date,
    isCluster: getIsCluster(),
    isDry: args.includes('--dry'),
  };
}

export async function up() {
  const { date, isDry } = parseArgs();

  console.log('='.repeat(60));
  console.log('  DEDUP: events_tmp → events_tmp2');
  console.log(`  Date:    ${date}`);
  console.log(`  Mode:    ${isDry ? 'DRY RUN' : 'EXECUTE'}`);
  console.log('='.repeat(60));

  // Step 0: Show current counts in events_tmp for this date
  console.log(`\n[Step 0] events_tmp counts for ${date}:`);
  const beforeResult = await chMigrationClient.query({
    query: `
      SELECT
        count() as total,
        uniq(${DEDUP_KEY}) as unique_events,
        count() - uniq(${DEDUP_KEY}) as duplicates
      FROM ${SRC_TABLE}
      WHERE toDate(created_at) = '${date}'`,
    format: 'JSONEachRow',
  });
  const beforeData = await beforeResult.json<{
    total: string;
    unique_events: string;
    duplicates: string;
  }>();

  const srcTotal = Number(beforeData[0]?.total ?? 0);
  const srcUnique = Number(beforeData[0]?.unique_events ?? 0);
  const srcDups = Number(beforeData[0]?.duplicates ?? 0);

  console.log(`\n  Total:      ${srcTotal.toLocaleString()}`);
  console.log(`  Unique:     ${srcUnique.toLocaleString()}`);
  console.log(`  Duplicates: ${srcDups.toLocaleString()}`);

  if (srcTotal === 0) {
    console.log('\n  No events found for this date!');
    return;
  }

  if (isDry) {
    console.log('\n[DRY RUN] SQL that would execute:');
    console.log(`
  INSERT INTO ${DST_TABLE}
  SELECT * FROM ${SRC_TABLE}
  WHERE toDate(created_at) = '${date}'
  LIMIT 1 BY ${DEDUP_KEY}
  SETTINGS max_memory_usage = 40000000000, max_execution_time = 18000;`);
    return;
  }

  // Step 1: Insert deduplicated data
  console.log(`\n[Step 1] Inserting deduped ${date} into ${DST_TABLE}...`);
  await runClickhouseMigrationCommands([
    `INSERT INTO ${DST_TABLE}
     SELECT * FROM ${SRC_TABLE}
     WHERE toDate(created_at) = '${date}'
     LIMIT 1 BY ${DEDUP_KEY}
     SETTINGS
       max_memory_usage = 40000000000,
       max_execution_time = 18000`,
  ]);

  // Step 2: Verify counts
  console.log(`\n[Step 2] Verifying ${DST_TABLE} count for ${date}:`);
  const afterResult = await chMigrationClient.query({
    query: `
      SELECT count() as total
      FROM ${DST_TABLE}
      WHERE toDate(created_at) = '${date}'`,
    format: 'JSONEachRow',
  });
  const afterData = await afterResult.json<{ total: string }>();
  const dstTotal = Number(afterData[0]?.total ?? 0);

  console.log(`\n  events_tmp:  ${srcTotal.toLocaleString()}`);
  console.log(`  events_tmp2: ${dstTotal.toLocaleString()}`);
  console.log(`  Removed:     ${(srcTotal - dstTotal).toLocaleString()}`);

  console.log('\n' + '='.repeat(60));
  console.log('  DEDUP COMPLETE');
  console.log('='.repeat(60));
}

export async function down() {
  console.log('No down migration');
}
