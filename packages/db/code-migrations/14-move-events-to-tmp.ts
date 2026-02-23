import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Move events to events_tmp2 for a given date
 *
 * Copies data as-is from events to events_tmp2 (no dedup).
 * Used to bring Jan 16-31 data into events_tmp2.
 *
 * Usage:
 *   Dry run:
 *     pnpm migrate:deploy:code -- 14 --cluster --dry --date=2026-01-16
 *
 *   Execute:
 *     pnpm migrate:deploy:code -- 14 --cluster --date=2026-01-16 --no-record
 */

const TMP_TABLE = 'events_tmp2';
const EVENTS_TABLE = 'events';

function parseArgs() {
  const args = process.argv;
  const dateArg = args.find((a: string) => a.startsWith('--date='));

  if (!dateArg) {
    console.error('Missing required --date=YYYY-MM-DD argument');
    console.error('   Example: pnpm migrate:deploy:code -- 14 --cluster --date=2026-01-16');
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
  console.log('  MOVE EVENTS TO EVENTS_TMP2');
  console.log(`  Date:    ${date}`);
  console.log(`  Mode:    ${isDry ? 'DRY RUN' : 'EXECUTE'}`);
  console.log('='.repeat(60));

  // Step 0: Check source counts
  console.log(`\n[Step 0] events count for ${date}:`);
  const srcResult = await chMigrationClient.query({
    query: `
      SELECT
        name,
        count() as total
      FROM ${EVENTS_TABLE}
      WHERE toDate(created_at) = '${date}'
      GROUP BY name
      ORDER BY total DESC`,
    format: 'JSONEachRow',
  });
  const srcData = await srcResult.json<{ name: string; total: string }>();

  let srcTotal = 0;
  console.log(`\n  ${'Event'.padEnd(25)} ${'Total'.padStart(10)}`);
  console.log('  ' + '-'.repeat(37));
  for (const row of srcData) {
    const total = Number(row.total);
    srcTotal += total;
    console.log(`  ${row.name.padEnd(25)} ${total.toLocaleString().padStart(10)}`);
  }
  console.log('  ' + '-'.repeat(37));
  console.log(`  ${'TOTAL'.padEnd(25)} ${srcTotal.toLocaleString().padStart(10)}`);

  if (srcTotal === 0) {
    console.log('\n  No events found for this date!');
    return;
  }

  if (isDry) {
    console.log('\n[DRY RUN] SQL that would execute:');
    console.log(`
  INSERT INTO ${TMP_TABLE}
  SELECT * FROM ${EVENTS_TABLE}
  WHERE toDate(created_at) = '${date}'
  SETTINGS max_memory_usage = 40000000000, max_execution_time = 18000;`);
    return;
  }

  // Step 1: Copy data
  console.log(`\n[Step 1] Copying ${srcTotal.toLocaleString()} events into ${TMP_TABLE}...`);
  await runClickhouseMigrationCommands([
    `INSERT INTO ${TMP_TABLE}
     SELECT * FROM ${EVENTS_TABLE}
     WHERE toDate(created_at) = '${date}'
     SETTINGS
       max_memory_usage = 40000000000,
       max_execution_time = 18000`,
  ]);

  // Step 2: Verify
  console.log(`\n[Step 2] Verifying events_tmp2 count for ${date}:`);
  const dstResult = await chMigrationClient.query({
    query: `
      SELECT count() as total
      FROM ${TMP_TABLE}
      WHERE toDate(created_at) = '${date}'`,
    format: 'JSONEachRow',
  });
  const dstData = await dstResult.json<{ total: string }>();
  const dstTotal = Number(dstData[0]?.total ?? 0);

  console.log(`\n  events:     ${srcTotal.toLocaleString()}`);
  console.log(`  events_tmp2: ${dstTotal.toLocaleString()}`);

  console.log('\n' + '='.repeat(60));
  console.log('  COPY COMPLETE');
  console.log('='.repeat(60));
}

export async function down() {
  console.log('No down migration');
}
