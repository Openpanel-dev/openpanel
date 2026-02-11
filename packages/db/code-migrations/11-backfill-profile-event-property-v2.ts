import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Backfill profile_event_property_summary_mv in hourly batches
 *
 * Safe to run on existing table - AggregatingMergeTree will merge states correctly!
 *
 * Usage:
 *   # For clustered (production):
 *   npm run migrate -- 11 --start-date=2025-01-01 --end-date=2026-01-10 --table=profile_event_property_summary_mv_replicated
 *
 *   # For self-hosted:
 *   npm run migrate -- 11 --start-date=2025-01-01 --end-date=2026-01-10 --table=profile_event_property_summary_mv
 *
 *   # Optional flags:
 *   npm run migrate -- 11 ... --dry              (dry run only)
 *   npm run migrate -- 11 ... --batch-hours=2    (larger batches)
 *   npm run migrate -- 11 ... --skip-existing    (skip dates that have data)
 */

interface BackfillOptions {
  startDate: string;
  endDate: string;
  targetTable: string;
  isDryRun: boolean;
  batchSizeHours: number;
}

function parseArgs(): BackfillOptions {
  const args = process.argv;

  const startDateArg = args.find(arg => arg.startsWith('--start-date='));
  const endDateArg = args.find(arg => arg.startsWith('--end-date='));
  const tableArg = args.find(arg => arg.startsWith('--table='));
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-hours='));

  if (!startDateArg || !endDateArg || !tableArg) {
    console.error('❌ Missing required arguments');
    console.log('');
    console.log('Usage:');
    console.log('  npm run migrate -- 11 \\');
    console.log('    --start-date=2025-01-01 \\');
    console.log('    --end-date=2026-01-10 \\');
    console.log('    --table=profile_event_property_summary_mv_v2_replicated');
    console.log('');
    console.log('Optional flags:');
    console.log('  --batch-hours=1    (default: 1, process N hours at a time)');
    console.log('  --dry              (generate SQL only, don\'t execute)');
    console.log('');
    process.exit(1);
  }

  return {
    startDate: startDateArg.split('=')[1]!,
    endDate: endDateArg.split('=')[1]!,
    targetTable: tableArg.split('=')[1]!,
    isDryRun: args.includes('--dry'),
    batchSizeHours: batchSizeArg ? parseInt(batchSizeArg.split('=')[1]!) : 1,
  };
}

export async function up() {
  const options = parseArgs();

  console.log('🚀 Profile Event Property Summary Backfill');
  console.log('='.repeat(60));
  console.log(`📅 Date Range:  ${options.startDate} to ${options.endDate}`);
  console.log(`📦 Target Table: ${options.targetTable}`);
  console.log(`⏱️  Batch Size:   ${options.batchSizeHours} hour(s)`);
  console.log(`🔧 Mode:        ${options.isDryRun ? 'DRY RUN' : 'EXECUTION'}`);
  console.log('='.repeat(60));
  console.log('');

  // Step 1: Analyze data to backfill
  const analysis = await analyzeDataRange(options.startDate, options.endDate);

  if (!analysis.hasData) {
    console.log('⚠️  No data found in date range');
    return;
  }

  console.log('📊 Data Analysis:');
  console.log(`   Events:              ${analysis.totalEvents.toLocaleString()}`);
  console.log(`   Profiles:            ${analysis.totalProfiles.toLocaleString()}`);
  console.log(`   Avg Props/Event:     ${analysis.avgProperties.toFixed(1)}`);
  console.log(`   Est. MV Rows:        ${Math.round(analysis.totalEvents * analysis.avgProperties).toLocaleString()}`);
  console.log('');

  // Step 2: Generate hourly batches
  const batches = generateHourlyBatches(
    options.startDate,
    options.endDate,
    options.batchSizeHours,
    options.targetTable
  );

  console.log(`📦 Generated ${batches.length} batches`);
  console.log(`⏱️  Est. Time: ${formatEstimatedTime(batches.length)} (at ~30s/batch)`);
  console.log('');

  if (options.isDryRun) {
    console.log('🔍 DRY RUN - Sample batch SQL:');
    console.log('─'.repeat(80));
    console.log(batches[0]?.sql.trim() || 'No batches generated');
    console.log('─'.repeat(80));
    console.log('');
    console.log(`💡 Total batches: ${batches.length}`);
    console.log('💡 Remove --dry to execute');
    return;
  }

  // Step 3: Execute batches
  await executeBatches(batches, options.targetTable);
}

async function analyzeDataRange(startDate: string, endDate: string) {
  console.log('🔍 Analyzing data...');

  const query = `
    SELECT
      count() as total_events,
      uniq(profile_id) as total_profiles,
      sum(length(mapKeys(properties))) as total_properties
    FROM events
    PREWHERE toDate(created_at) >= '${startDate}'
      AND toDate(created_at) <= '${endDate}'
      AND profile_id != device_id
    WHERE arrayExists(k -> k != '', mapKeys(properties))
      AND arrayExists(v -> v != '', mapValues(properties))
  `;

  const result = await chMigrationClient.query({ query, format: 'JSONEachRow' });
  const data = await result.json<{
    total_events: string;
    total_profiles: string;
    total_properties: string;
  }>();

  const row = data[0];
  if (!row || row.total_events === '0') {
    return { hasData: false, totalEvents: 0, totalProfiles: 0, avgProperties: 0 };
  }

  const totalEvents = Number(row.total_events);
  const totalProperties = Number(row.total_properties);

  return {
    hasData: true,
    totalEvents,
    totalProfiles: Number(row.total_profiles),
    avgProperties: totalProperties / totalEvents,
  };
}

function generateHourlyBatches(
  startDate: string,
  endDate: string,
  batchSizeHours: number,
  targetTable: string
) {
  const batches: Array<{ startTime: string; endTime: string; sql: string }> = [];

  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');
  let current = new Date(start);

  while (current < end) {
    const batchEnd = new Date(current);
    batchEnd.setHours(current.getHours() + batchSizeHours);

    // Ensure we don't go past the end date
    if (batchEnd > end) {
      batchEnd.setTime(end.getTime());
    }

    const startStr = current.toISOString().slice(0, 19).replace('T', ' ');
    const endStr = batchEnd.toISOString().slice(0, 19).replace('T', ' ');

    const sql = `
INSERT INTO ${targetTable}
SELECT
  project_id,
  profile_id,
  name,
  property_key,
  property_value,
  toStartOfDay(created_at) AS event_date,
  countState() AS event_count,
  minState(created_at) AS first_event_time,
  maxState(created_at) AS last_event_time
FROM events
ARRAY JOIN
  mapKeys(properties) AS property_key,
  mapValues(properties) AS property_value
PREWHERE
  created_at >= toDateTime64('${startStr}', 3)
  AND created_at < toDateTime64('${endStr}', 3)
  AND profile_id != device_id
WHERE
  property_key != ''
  AND property_value != ''
GROUP BY project_id, profile_id, name, property_key, property_value, event_date
SETTINGS
  max_memory_usage = 10000000000,
  max_execution_time = 1800,
  max_threads = 8`;

    batches.push({ startTime: startStr, endTime: endStr, sql });

    // Advance to next batch start
    current = new Date(batchEnd);

    // Break if we've reached or passed the end (prevent infinite loop)
    if (current >= end) {
      break;
    }
  }

  return batches;
}

async function executeBatches(
  batches: Array<{ startTime: string; endTime: string; sql: string }>,
  targetTable: string
) {
  console.log('🚀 Starting execution...');
  console.log('💡 Progress is auto-saved (can Ctrl+C and resume)');
  console.log('');

  let completed = 0;
  let skipped = 0;
  const total = batches.length;
  const startTime = Date.now();

  for (const batch of batches) {
    try {
      const checkDate = batch.startTime.split(' ')[0];

      // Check if data already exists (for resumption)
      const checkQuery = `SELECT count() as c FROM ${targetTable} WHERE event_date = '${checkDate}' LIMIT 1`;
      const checkResult = await chMigrationClient.query({ query: checkQuery, format: 'JSONEachRow' });
      const checkData = await checkResult.json<{ c: string }>();

      if (checkData[0] && Number(checkData[0].c) > 1000) {
        skipped++;
        completed++;
        if (completed % 50 === 0) {
          logProgress(completed, total, skipped, startTime);
        }
        continue;
      }

      // Execute INSERT
      const execStart = Date.now();
      await runClickhouseMigrationCommands([batch.sql]);
      const execTime = Date.now() - execStart;

      completed++;

      if (completed % 50 === 0 || execTime > 60000) {
        logProgress(completed, total, skipped, startTime, `${batch.startTime} to ${batch.endTime}`, execTime);
      }

    } catch (error: any) {
      console.error(`\n❌ Error: ${batch.startTime}`, error.message);
      throw error;
    }
  }

  const totalTime = Date.now() - startTime;

  console.log('');
  console.log('✅ Backfill complete!');
  console.log(`   Time:      ${formatTime(Math.round(totalTime / 1000))}`);
  console.log(`   Processed: ${completed - skipped}`);
  console.log(`   Skipped:   ${skipped}`);
  console.log('');
}

function logProgress(
  completed: number,
  total: number,
  skipped: number,
  startTime: number,
  label?: string,
  execTime?: number
) {
  const pct = Math.round((completed / total) * 100);
  const elapsed = (Date.now() - startTime) / 1000;
  const remaining = ((total - completed) / completed) * elapsed;

  let msg = `   [${pct}%] ${completed}/${total} | ETA: ${formatTime(Math.round(remaining))}`;
  if (skipped > 0) msg += ` | Skipped: ${skipped}`;
  if (label && execTime) msg += `\n   Last: ${label} (${Math.round(execTime / 1000)}s)`;

  console.log(msg);
}

function formatTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}m`;
}

function formatEstimatedTime(batches: number): string {
  return formatTime(batches * 30);
}

export async function down() {
  console.log('⚠️  No down migration - backfill is data only');
}
