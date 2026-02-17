import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Deduplication validation for a single day
 *
 * Validates dedup logic on a single day before running on full partitions.
 * Does NOT replace any partition — production is untouched.
 *
 * Usage:
 *   pnpm migrate:deploy:code -- 13 --cluster --dry --date=2025-11-14
 *   pnpm migrate:deploy:code -- 13 --cluster --date=2025-11-14 --no-record
 */

const DEDUP_KEY =
  'project_id, name, device_id, profile_id, session_id, created_at, path, properties';

const TMP_TABLE = 'events_tmp';

function parseArgs() {
  const args = process.argv;
  const dateArg = args.find((a: string) => a.startsWith('--date='));

  if (!dateArg) {
    console.error('❌ Missing required --date=YYYY-MM-DD argument');
    console.error('   Example: pnpm migrate:deploy:code -- 13 --cluster --date=2025-11-14');
    process.exit(1);
  }

  const date = dateArg!.split('=')[1]!;
  const partition = date.replace(/-/g, '').slice(0, 6); // "2025-11-14" → "202511"

  return {
    date,
    partition,
    isCluster: getIsCluster(),
    isDry: args.includes('--dry'),
  };
}

export async function up() {
  const { date, partition, isCluster, isDry } = parseArgs();

  console.log('='.repeat(60));
  console.log('  DEDUP VALIDATION');
  console.log(`  Date:    ${date} (partition: ${partition})`);
  console.log(`  Mode:    ${isDry ? 'DRY RUN' : 'EXECUTE'} | Cluster: ${isCluster}`);
  console.log('='.repeat(60));

  // Step 0: Show current counts for given date
  console.log(`\n[Step 0] Current counts for ${date}:`);
  const beforeResult = await chMigrationClient.query({
    query: `
      SELECT
        name,
        count() as total,
        uniq(${DEDUP_KEY}) as unique_events,
        count() - uniq(${DEDUP_KEY}) as duplicates,
        round((count() - uniq(${DEDUP_KEY})) / count() * 100, 2) as dup_pct
      FROM events
      WHERE toYYYYMM(created_at) = ${partition}
        AND toDate(created_at) = '${date}'
      GROUP BY name
      ORDER BY duplicates DESC`,
    format: 'JSONEachRow',
  });
  const beforeData = await beforeResult.json<{
    name: string;
    total: string;
    unique_events: string;
    duplicates: string;
    dup_pct: string;
  }>();

  console.log(`\n  ${'Event'.padEnd(25)} ${'Total'.padStart(10)} ${'Unique'.padStart(10)} ${'Dupes'.padStart(10)} ${'%'.padStart(6)}`);
  console.log('  ' + '─'.repeat(65));
  for (const row of beforeData) {
    console.log(
      `  ${row.name.padEnd(25)} ${Number(row.total).toLocaleString().padStart(10)} ${Number(row.unique_events).toLocaleString().padStart(10)} ${Number(row.duplicates).toLocaleString().padStart(10)} ${row.dup_pct.padStart(5)}%`,
    );
  }

  if (isDry) {
    console.log('\n[DRY RUN] SQL that would execute:');
    console.log(`
  INSERT INTO ${TMP_TABLE}
  SELECT * FROM events
  WHERE toYYYYMM(created_at) = ${partition}
    AND toDate(created_at) = '${date}'
  ORDER BY imported_at ASC
  LIMIT 1 BY ${DEDUP_KEY};`);
    return;
  }

  // Step 1: Insert deduplicated data
  console.log(`\n[Step 1] Inserting deduplicated ${date} into ${TMP_TABLE}...`);
  console.log(`  (reads full ${partition} partition, progress shown every 5s)`);
  await runClickhouseMigrationCommands([
    `INSERT INTO ${TMP_TABLE}
     SELECT * FROM events
     WHERE toYYYYMM(created_at) = ${partition}
       AND toDate(created_at) = '${date}'
     ORDER BY imported_at ASC
     LIMIT 1 BY ${DEDUP_KEY}
     SETTINGS
       max_memory_usage = 15000000000,
       max_execution_time = 18000`,
  ]);

  // Step 2: Compare counts
  console.log(`\n[Step 2] Comparing counts before vs after dedup:`);
  const afterResult = await chMigrationClient.query({
    query: `
      SELECT name, count() as total
      FROM ${TMP_TABLE}
      WHERE toDate(created_at) = '${date}'
      GROUP BY name
      ORDER BY total DESC`,
    format: 'JSONEachRow',
  });
  const afterData = await afterResult.json<{ name: string; total: string }>();
  const afterMap = new Map(afterData.map((r) => [r.name, Number(r.total)]));

  console.log(`\n  ${'Event'.padEnd(25)} ${'Before'.padStart(10)} ${'After'.padStart(10)} ${'Removed'.padStart(10)} ${'%'.padStart(6)}`);
  console.log('  ' + '─'.repeat(65));
  for (const row of beforeData) {
    const before = Number(row.total);
    const after = afterMap.get(row.name) ?? 0;
    const removed = before - after;
    const pct = ((removed / before) * 100).toFixed(1);
    console.log(
      `  ${row.name.padEnd(25)} ${before.toLocaleString().padStart(10)} ${after.toLocaleString().padStart(10)} ${removed.toLocaleString().padStart(10)} ${pct.padStart(5)}%`,
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('  VALIDATION COMPLETE');
  console.log('  If counts look correct → run full month script (migration 14)');
  console.log('='.repeat(60));
}

export async function down() {
  console.log('No down migration for validation script');
}
