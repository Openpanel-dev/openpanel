import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * IST Data Loss Validation & Recovery
 *
 * Validates how much data was lost due to IST filter in moveImportsToProduction,
 * and optionally recovers the lost events from events_imports_v2 into events_tmp.
 *
 * Lost events = those where toDate(created_at) != toDate(addHours(created_at, 5.5))
 * i.e., events between 18:30-23:59 UTC (00:00-05:30 IST next day)
 *
 * Usage:
 *   Validate only (dry run):
 *     pnpm migrate:deploy:code -- 13 --cluster --dry --date=2026-01-05
 *
 *   Validate and recover:
 *     pnpm migrate:deploy:code -- 13 --cluster --date=2026-01-05 --no-record
 */

const IMPORTS_TABLE = 'events_imports_v2';
const TMP_TABLE = 'events_tmp';

const DEDUP_KEY =
  'project_id, name, device_id, profile_id, toStartOfSecond(created_at), path, properties';

const COLUMNS = `id, name, sdk_name, sdk_version, device_id, profile_id, project_id,
  session_id, path, origin, referrer, referrer_name, referrer_type,
  duration, created_at, country, city, region, longitude, latitude,
  os, os_version, browser, browser_version, device, brand, model, imported_at`;

const COLUMNS = `id, name, sdk_name, sdk_version, device_id, profile_id, project_id,
  session_id, path, origin, referrer, referrer_name, referrer_type,
  duration, created_at, country, city, region, longitude, latitude,
  os, os_version, browser, browser_version, device, brand, model, imported_at`;

function parseArgs() {
  const args = process.argv;
  const dateArg = args.find((a: string) => a.startsWith('--date='));

  if (!dateArg) {
    console.error('Missing required --date=YYYY-MM-DD argument');
    console.error('   Example: pnpm migrate:deploy:code -- 13 --cluster --date=2026-01-05');
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
  const { date, isCluster, isDry } = parseArgs();

  console.log('='.repeat(60));
  console.log('  IST DATA LOSS VALIDATION');
  console.log(`  Date:    ${date}`);
  console.log(`  Mode:    ${isDry ? 'DRY RUN (validate only)' : 'EXECUTE (validate + recover)'}`);
  console.log('='.repeat(60));

  // Step 0: Check events_tmp current state for this date
  console.log(`\n[Step 0] Current events_tmp counts for UTC ${date}:`);
  const tmpResult = await chMigrationClient.query({
    query: `
      SELECT
        name,
        count() as total,
        uniq(${DEDUP_KEY}) as unique_events
      FROM ${TMP_TABLE}
      WHERE toDate(created_at) = '${date}'
      GROUP BY name
      ORDER BY total DESC`,
    format: 'JSONEachRow',
  });
  const tmpData = await tmpResult.json<{ name: string; total: string; unique_events: string }>();
  const tmpMap = new Map(tmpData.map((r) => [r.name, { total: Number(r.total), unique: Number(r.unique_events) }]));

  console.log(`\n  ${'Event'.padEnd(25)} ${'Total'.padStart(10)} ${'Unique'.padStart(10)}`);
  console.log('  ' + '-'.repeat(47));
  for (const row of tmpData) {
    console.log(
      `  ${row.name.padEnd(25)} ${Number(row.total).toLocaleString().padStart(10)} ${Number(row.unique_events).toLocaleString().padStart(10)}`,
    );
  }
  console.log('  ' + '-'.repeat(37));
  console.log(`  ${'TOTAL'.padEnd(25)} ${totalLost.toLocaleString().padStart(10)}`);

  // Step 1: Check events_imports_v2 full counts for this date (source of truth)
  console.log(`\n[Step 1] events_imports_v2 vs events_tmp for UTC ${date}:`);
  const importsResult = await chMigrationClient.query({
    query: `
      SELECT
        name,
        count() as total,
        uniq(${DEDUP_KEY}) as unique_events
      FROM ${IMPORTS_TABLE}
      WHERE toDate(created_at) = '${date}'
      GROUP BY name
      ORDER BY total DESC`,
    format: 'JSONEachRow',
  });
  const importsData = await importsResult.json<{ name: string; total: string; unique_events: string }>();

  console.log(`\n  ${'Event'.padEnd(25)} ${'imp_total'.padStart(10)} ${'imp_uniq'.padStart(10)} ${'tmp_total'.padStart(10)} ${'tmp_uniq'.padStart(10)} ${'Missing'.padStart(10)}`);
  console.log('  ' + '-'.repeat(77));
  for (const row of importsData) {
    const impTotal = Number(row.total);
    const impUniq = Number(row.unique_events);
    const tmp = tmpMap.get(row.name) ?? { total: 0, unique: 0 };
    const missingUniq = impUniq - tmp.unique;
    console.log(
      `  ${row.name.padEnd(25)} ${impTotal.toLocaleString().padStart(10)} ${impUniq.toLocaleString().padStart(10)} ${tmp.total.toLocaleString().padStart(10)} ${tmp.unique.toLocaleString().padStart(10)} ${missingUniq.toLocaleString().padStart(10)}`,
    );
  }

  // Step 2: Check lost events (18:30-23:59 UTC = where UTC date != IST date)
  console.log(`\n[Step 2] Lost events (18:30-23:59 UTC, not moved to events_tmp):`);
  const lostResult = await chMigrationClient.query({
    query: `
      SELECT
        name,
        count() as lost_total
      FROM ${IMPORTS_TABLE}
      WHERE toDate(created_at) = '${date}'
        AND toDate(created_at) != toDate(addHours(created_at, 5.5))
      GROUP BY name
      ORDER BY lost_total DESC`,
    format: 'JSONEachRow',
  });
  const lostData = await lostResult.json<{ name: string; lost_total: string }>();

  let totalLost = 0;
  console.log(`\n  ${'Event'.padEnd(25)} ${'Lost'.padStart(10)}`);
  console.log('  ' + '-'.repeat(37));
  for (const row of lostData) {
    const lost = Number(row.lost_total);
    totalLost += lost;
    console.log(
      `  ${row.name.padEnd(25)} ${lost.toLocaleString().padStart(10)}`,
    );
  }
  console.log('  ' + '-'.repeat(37));
  console.log(`  ${'TOTAL'.padEnd(25)} ${totalLost.toLocaleString().padStart(10)}`);

  if (isDry) {
    console.log('\n[DRY RUN] Recovery SQL that would execute:');
    console.log(`
  INSERT INTO ${TMP_TABLE} (${COLUMNS})
  SELECT ${COLUMNS}
  FROM ${IMPORTS_TABLE}
  WHERE toDate(created_at) = '${date}'
    AND toDate(created_at) != toDate(addHours(created_at, 5.5))
  SETTINGS max_memory_usage = 40000000000, max_execution_time = 18000;`);
    console.log('\n  Run without --dry to execute recovery.');
    return;
  }

  // Step 3: Recover lost events
  if (totalLost === 0) {
    console.log('\n  No lost events to recover!');
    return;
  }

  console.log(`\n[Step 3] Recovering ${totalLost.toLocaleString()} lost events into ${TMP_TABLE}...`);
  await runClickhouseMigrationCommands([
    `INSERT INTO ${TMP_TABLE} (${COLUMNS})
     SELECT ${COLUMNS}
     FROM ${IMPORTS_TABLE}
     WHERE toDate(created_at) = '${date}'
       AND toDate(created_at) != toDate(addHours(created_at, 5.5))
     SETTINGS
       max_memory_usage = 40000000000,
       max_execution_time = 18000`,
  ]);

  // Step 4: Verify recovery
  console.log(`\n[Step 4] Verifying recovery - events_tmp counts after:`);
  const afterResult = await chMigrationClient.query({
    query: `
      SELECT
        name,
        count() as total,
        uniq(${DEDUP_KEY}) as unique_events
      FROM ${TMP_TABLE}
      WHERE toDate(created_at) = '${date}'
      GROUP BY name
      ORDER BY total DESC`,
    format: 'JSONEachRow',
  });
  const afterData = await afterResult.json<{ name: string; total: string; unique_events: string }>();

  console.log(`\n  ${'Event'.padEnd(25)} ${'Before'.padStart(10)} ${'After'.padStart(10)} ${'Recovered'.padStart(10)} ${'Unique'.padStart(10)}`);
  console.log('  ' + '-'.repeat(67));
  for (const row of afterData) {
    const after = Number(row.total);
    const unique = Number(row.unique_events);
    const before = (tmpMap.get(row.name) ?? { total: 0 }).total;
    const recovered = after - before;
    console.log(
      `  ${row.name.padEnd(25)} ${before.toLocaleString().padStart(10)} ${after.toLocaleString().padStart(10)} ${recovered.toLocaleString().padStart(10)} ${unique.toLocaleString().padStart(10)}`,
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('  RECOVERY COMPLETE');
  console.log('='.repeat(60));
}

export async function down() {
  console.log('No down migration');
}
