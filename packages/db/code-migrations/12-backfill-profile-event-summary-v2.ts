import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Backfill profile_event_summary_mv_v2 in daily batches
 *
 * This MV is for simple event-based cohorts WITHOUT property filters
 * Much simpler than profile_event_property_summary_mv - no ARRAY JOIN
 *
 * Usage:
 *   # For clustered (production):
 *   npm run migrate -- 12 --start-date=2025-01-01 --end-date=2026-01-10 --table=profile_event_summary_mv_v2_replicated
 *
 *   # For self-hosted:
 *   npm run migrate -- 12 --start-date=2025-01-01 --end-date=2026-01-10 --table=profile_event_summary_mv_v2
 *
 *   # Optional flags:
 *   npm run migrate -- 12 ... --dry              (dry run only)
 */

interface BackfillOptions {
  startDate: string;
  endDate: string;
  targetTable: string;
  isDryRun: boolean;
}

function parseArgs(): BackfillOptions {
  const args = process.argv;

  const startDateArg = args.find(arg => arg.startsWith('--start-date='));
  const endDateArg = args.find(arg => arg.startsWith('--end-date='));
  const tableArg = args.find(arg => arg.startsWith('--table='));

  if (!startDateArg || !endDateArg || !tableArg) {
    console.error('❌ Missing required arguments');
    console.log('');
    console.log('Usage:');
    console.log('  npm run migrate -- 12 \\');
    console.log('    --start-date=2025-01-01 \\');
    console.log('    --end-date=2026-01-10 \\');
    console.log('    --table=profile_event_summary_mv_v2');
    console.log('');
    console.log('Optional flags:');
    console.log('  --dry              (generate SQL only, don\'t execute)');
    console.log('');
    process.exit(1);
  }

  return {
    startDate: startDateArg.split('=')[1]!,
    endDate: endDateArg.split('=')[1]!,
    targetTable: tableArg.split('=')[1]!,
    isDryRun: args.includes('--dry'),
  };
}

export async function up() {
  const options = parseArgs();

  console.log('🚀 Profile Event Summary Backfill (Daily Batches)');
  console.log('='.repeat(60));
  console.log(`📅 Date Range:  ${options.startDate} to ${options.endDate}`);
  console.log(`📦 Target Table: ${options.targetTable}`);
  console.log(`🔧 Mode:        ${options.isDryRun ? 'DRY RUN' : 'EXECUTION'}`);
  console.log('='.repeat(60));
  console.log('');

  // Skip analysis
  console.log('⏩ Skipping analysis - will process all events in date range');
  console.log('');

  // Generate daily batches
  const batches = generateDailyBatches(
    options.startDate,
    options.endDate,
    options.targetTable
  );

  console.log(`📦 Generated ${batches.length} daily batches`);
  console.log(`⏱️  Est. Time: ${formatEstimatedTime(batches.length)} (at ~2min/day)`);
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

  // Execute batches
  await executeBatches(batches);
}

function generateDailyBatches(
  startDate: string,
  endDate: string,
  targetTable: string
) {
  const batches: Array<{ date: string; sql: string }> = [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  let current = new Date(start);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];

    const sql = `
INSERT INTO ${targetTable}
SELECT
  project_id,
  profile_id,
  name,
  toStartOfDay(created_at) AS event_date,
  countState() AS event_count,
  minState(created_at) AS first_event_time,
  maxState(created_at) AS last_event_time,
  sumState(duration) AS total_duration
FROM events
PREWHERE
  toDate(created_at) = '${dateStr}'
  AND profile_id != device_id
GROUP BY project_id, profile_id, name, event_date
SETTINGS
  max_memory_usage = 30000000000,
  max_execution_time = 7200,
  max_threads = 16`;

    batches.push({ date: dateStr, sql });

    // Move to next day
    current.setDate(current.getDate() + 1);
  }

  return batches;
}

async function executeBatches(
  batches: Array<{ date: string; sql: string }>
) {
  console.log('🚀 Starting execution...');
  console.log('💡 AggregatingMergeTree will merge any duplicate data');
  console.log('');

  let completed = 0;
  const total = batches.length;
  const startTime = Date.now();

  for (const batch of batches) {
    try {
      // Execute INSERT
      const execStart = Date.now();
      await runClickhouseMigrationCommands([batch.sql]);
      const execTime = Date.now() - execStart;

      completed++;

      // Show progress every 10 batches or if query took > 2 minutes
      if (completed % 10 === 0 || execTime > 120000 || completed === total) {
        logProgress(completed, total, startTime, batch.date, execTime);
      }

    } catch (error: any) {
      console.error(`\n❌ Error processing ${batch.date}:`, error.message);
      throw error;
    }
  }

  const totalTime = Date.now() - startTime;

  console.log('');
  console.log('✅ Backfill complete!');
  console.log(`   Time:      ${formatTime(Math.round(totalTime / 1000))}`);
  console.log(`   Processed: ${completed}/${total} days`);
  console.log(`   Avg/day:   ${Math.round(totalTime / completed / 1000)}s`);
  console.log('');
}

function logProgress(
  completed: number,
  total: number,
  startTime: number,
  date: string,
  execTime: number
) {
  const pct = Math.round((completed / total) * 100);
  const elapsed = (Date.now() - startTime) / 1000;
  const remaining = ((total - completed) / completed) * elapsed;

  const msg = `   [${pct}%] ${completed}/${total} | ETA: ${formatTime(Math.round(remaining))}\n   Last: ${date} (${Math.round(execTime / 1000)}s)`;
  console.log(msg);
}

function formatTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}m`;
}

function formatEstimatedTime(days: number): string {
  // Assume ~2 minutes per day on average
  return formatTime(days * 120);
}

export async function down() {
  console.log('⚠️  No down migration - backfill is data only');
}
