import fs from 'node:fs';
import path from 'node:path';
import {
  chMigrationClient,
  createMaterializedView,
  moveDataBetweenTables,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Migration 9: Create events_daily_stats to include ALL events
 *
 * Prerequisites: Drop existing events_daily_stats before running this migration
 *
 * This migration creates events_daily_stats MV that includes ALL events for complete analytics.
 * Previous version excluded session_start, session_end, and screen_view events.
 *
 * Steps:
 * 1. Optionally delete existing data up to a certain date
 * 2. Optionally create events_daily_stats without POPULATE (starts capturing new data)
 * 3. Backfill historical data from events table using day-by-day batch inserts
 *
 * Usage:
 *   # Full migration (create MV + backfill all data)
 *   pnpm tsx packages/db/code-migrations/9-events-daily-stats.ts
 *
 *   # Backfill specific date range, skip MV creation, delete old data
 *   pnpm tsx packages/db/code-migrations/9-events-daily-stats.ts --start 2024-01-01 --end 2026-01-27 --delete-till 2026-01-28 --skip-mv
 *
 *   # Backfill without delete
 *   pnpm tsx packages/db/code-migrations/9-events-daily-stats.ts --start 2024-01-01 --end 2026-01-27 --skip-delete --skip-mv
 *
 *   # Dry run to see what will be executed
 *   pnpm tsx packages/db/code-migrations/9-events-daily-stats.ts --start 2024-01-01 --end 2026-01-27 --dry
 */
export async function up() {
  const isClustered = getIsCluster();
  const sqls: string[] = [];

  // Parse command line arguments
  const args = process.argv;
  const startDateArg = args.find((arg, idx) => args[idx - 1] === '--start');
  const endDateArg = args.find((arg, idx) => args[idx - 1] === '--end');
  const deleteDateArg = args.find((arg, idx) => args[idx - 1] === '--delete-till');
  const skipDelete = args.includes('--skip-delete');
  const skipMv = args.includes('--skip-mv');

  const targetTable = isClustered ? 'events_daily_stats_replicated' : 'events_daily_stats';

  // Step 1: Delete existing data in batches (optional)
  if (!skipDelete && deleteDateArg) {
    console.log(`🗑️  Preparing to delete data up to ${deleteDateArg} (day-by-day)`);

    // Query to get the date range that needs to be deleted
    const deleteRangeQuery = await chMigrationClient.query({
      query: `
        SELECT
          min(date) as min_date,
          max(date) as max_date
        FROM ${targetTable}
        WHERE date <= toDate('${deleteDateArg}')
      `,
      format: 'JSONEachRow',
    });

    const deleteRange = await deleteRangeQuery.json<{
      min_date: string;
      max_date: string;
    }>();

    if (deleteRange[0]?.min_date && deleteRange[0]?.max_date) {
      const deleteStartDate = new Date(deleteRange[0].min_date);
      const deleteEndDate = new Date(deleteRange[0].max_date);
      const deleteDays = Math.ceil((deleteEndDate.getTime() - deleteStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      console.log(`   Found data from ${deleteRange[0].min_date} to ${deleteRange[0].max_date} (${deleteDays} days)`);
      console.log('');

      // Generate day-by-day DELETE statements
      let currentDeleteDate = new Date(deleteStartDate);
      while (currentDeleteDate <= deleteEndDate) {
        const dateStr = currentDeleteDate.toISOString().split('T')[0];
        const deleteSql = `ALTER TABLE ${targetTable} DELETE WHERE date = toDate('${dateStr}')`;
        sqls.push(deleteSql);
        currentDeleteDate.setDate(currentDeleteDate.getDate() + 1);
      }
    } else {
      console.log(`   No data found to delete up to ${deleteDateArg}`);
      console.log('');
    }
  }

  // Step 2: Create MV without POPULATE (so it starts capturing new data immediately)
  if (!skipMv) {
    const mvStatements = createMaterializedView({
      name: 'events_daily_stats',
      tableName: 'events',
      orderBy: ['project_id', 'name', 'date'],
      partitionBy: 'toYYYYMM(date)',
      query: `SELECT
        project_id,
        name,
        toDate(created_at) as date,
        uniqState(profile_id) as unique_profiles_state,
        uniqState(session_id) as unique_sessions_state,
        countState() as event_count
      FROM {events}
      GROUP BY project_id, name, date`,
      distributionHash: 'cityHash64(project_id, name, date)',
      replicatedVersion: '1',
      isClustered,
      populate: false, // Don't use POPULATE to avoid timeout
    });

    sqls.push(...mvStatements);
  }

  // Step 3: Backfill historical data from events table
  // First, check the actual date range in the events table
  const checkDataQuery = await chMigrationClient.query({
    query: `
      SELECT
        min(toDate(created_at)) as min_date,
        max(toDate(created_at)) as max_date,
        count() as total_events
      FROM events
    `,
    format: 'JSONEachRow',
  });

  const dataRange = await checkDataQuery.json<{
    min_date: string;
    max_date: string;
    total_events: string;
  }>();

  if (dataRange[0]?.min_date && dataRange[0]?.max_date) {
    // Determine start and end dates based on arguments or data range
    let startDate: Date;
    let endDate: Date;

    if (startDateArg) {
      startDate = new Date(startDateArg);
    } else {
      startDate = new Date(dataRange[0].min_date);
    }

    if (endDateArg) {
      endDate = new Date(endDateArg);
    } else {
      // If no end date specified, use max date from events table
      // But typically you'd want yesterday to avoid conflicts with MV
      endDate = new Date(dataRange[0].max_date);
    }

    const totalEvents = Number(dataRange[0].total_events);
    const backfillDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Count delete operations
    const deleteOps = sqls.filter(sql => sql.includes('DELETE')).length;
    const mvOps = sqls.filter(sql => sql.includes('CREATE') || sql.includes('MATERIALIZED VIEW')).length;

    console.log('========================================');
    console.log('📊 Backfill Plan:');
    console.log(`   Target Table:   ${targetTable}`);
    console.log(`   Delete Ops:     ${deleteOps > 0 ? `${deleteOps} days` : 'None'}`);
    console.log(`   Create MV:      ${skipMv ? 'Skipped' : 'Yes'}`);
    console.log(`   Backfill Start: ${startDate.toISOString().split('T')[0]}`);
    console.log(`   Backfill End:   ${endDate.toISOString().split('T')[0]} (inclusive)`);
    console.log(`   Backfill Days:  ${backfillDays} days`);
    console.log(`   Total Events:   ${totalEvents.toLocaleString()} in events table`);
    console.log('========================================');
    console.log('');

    // Generate day-by-day INSERT statements with proper GROUP BY
    const backfillSqls: string[] = [];

    let currentDate = new Date(startDate); // Start from startDate (go forward)

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];

      const sql = `INSERT INTO ${targetTable}
      SELECT
        project_id,
        name,
        toDate(created_at) as date,
        uniqState(profile_id) as unique_profiles_state,
        uniqState(session_id) as unique_sessions_state,
        countState() as event_count
      FROM events
      WHERE toDate(created_at) = '${dateStr}'
      GROUP BY project_id, name, date`;

      backfillSqls.push(sql);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    sqls.push(...backfillSqls);
  } else {
    console.log('No data found in the specified date range, skipping backfill');
  }

  // Write SQL to file for review
  const sqlFilePath = path.join(__filename.replace('.ts', '.sql'));
  fs.writeFileSync(
    sqlFilePath,
    sqls
      .map((sql) =>
        sql
          .trim()
          .replace(/;$/, '')
          .replace(/\n{2,}/g, '\n')
          .concat(';'),
      )
      .join('\n\n---\n\n'),
  );

  // Count operation types
  const deleteOpsTotal = sqls.filter(sql => sql.includes('DELETE')).length;
  const mvOpsTotal = sqls.filter(sql => sql.includes('CREATE') || sql.includes('MATERIALIZED VIEW')).length;
  const insertOpsTotal = sqls.filter(sql => sql.includes('INSERT')).length;

  console.log(`Generated ${sqls.length} SQL statements:`);
  console.log(`  - ${deleteOpsTotal} DELETE operations (day-by-day)`);
  console.log(`  - ${mvOpsTotal} MV creation operations`);
  console.log(`  - ${insertOpsTotal} INSERT operations (day-by-day)`);
  console.log(`SQL written to: ${sqlFilePath}`);
  console.log('');

  // Execute if not in dry-run mode
  if (!process.argv.includes('--dry')) {
    console.log('🚀 Executing migration...');
    console.log('');

    // Execute with progress tracking
    let completed = 0;
    const total = sqls.length;

    for (const sql of sqls) {
      await runClickhouseMigrationCommands([sql]);
      completed++;

      // Show progress every 10 queries or on last query
      if (completed % 10 === 0 || completed === total) {
        const percentage = ((completed / total) * 100).toFixed(1);
        console.log(`Progress: ${completed}/${total} (${percentage}%)`);
      }
    }

    console.log('');
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Verify data in events_daily_stats:');
    console.log(`   SELECT date, count() FROM ${targetTable} GROUP BY date ORDER BY date`);
    console.log('2. Check a few sample queries to ensure accuracy');
  } else {
    console.log('🔍 Dry-run mode: SQL generated but not executed');
    console.log('');
    console.log('To execute, run without --dry flag');
  }
}
