import fs from 'node:fs';
import path from 'node:path';
import {
  chMigrationClient,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Migration 10: Backfill profile_event_summary_mv with historical data
 *
 * Context: profile_event_summary_mv was created with populate: false to avoid OOM
 * This means it only captures NEW events, missing all historical data.
 * This migration backfills the MV with historical events for cohort queries.
 *
 * Hard backstop: January 1, 2025 (won't backfill data before this date)
 *
 * Steps:
 * 1. Check the date range of events in the events table
 * 2. Backfill historical data day-by-day in batches to avoid OOM
 * 3. Generate SQL file for review before execution
 */
export async function up() {
  const isClustered = getIsCluster();
  const sqls: string[] = [];

  // Hard backstop date - don't backfill before this
  const BACKSTOP_DATE = new Date('2025-01-01');

  // Step 1: Check the actual date range in the events table
  console.log('🔍 Checking date range in events table...');

  const checkDataQuery = await chMigrationClient.query({
    query: `
      SELECT
        min(toDate(created_at)) as min_date,
        max(toDate(created_at)) as max_date,
        count() as total_events,
        uniq(profile_id) as total_profiles
      FROM events
      WHERE profile_id != device_id
        AND toDate(created_at) >= '2025-01-01'
    `,
    format: 'JSONEachRow',
  });

  const dataRange = await checkDataQuery.json<{
    min_date: string;
    max_date: string;
    total_events: string;
    total_profiles: string;
  }>();

  if (dataRange[0]?.min_date && dataRange[0]?.max_date) {
    let startDate = new Date(dataRange[0].min_date);
    const endDate = new Date(dataRange[0].max_date);

    // Enforce backstop date
    if (startDate < BACKSTOP_DATE) {
      console.log(`⚠️  Data exists before backstop date, limiting to ${BACKSTOP_DATE.toISOString().split('T')[0]}`);
      startDate = BACKSTOP_DATE;
    }

    const totalEvents = Number(dataRange[0].total_events);
    const totalProfiles = Number(dataRange[0].total_profiles);
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    console.log('========================================');
    console.log('📊 Backfill Plan for profile_event_summary_mv:');
    console.log(`   Backstop Date: ${BACKSTOP_DATE.toISOString().split('T')[0]} (hard limit)`);
    console.log(`   Start Date:    ${startDate.toISOString().split('T')[0]}`);
    console.log(`   End Date:      ${endDate.toISOString().split('T')[0]} (inclusive)`);
    console.log(`   Days:          ${daysDiff} days`);
    console.log(`   Events:        ${totalEvents.toLocaleString()} total events`);
    console.log(`   Profiles:      ${totalProfiles.toLocaleString()} unique profiles`);
    console.log('========================================');
    console.log('');

    // Step 2: Generate day-by-day INSERT statements
    // Process from most recent to oldest to prioritize recent data for cohorts
    const targetTable = isClustered ? 'profile_event_summary_mv_replicated' : 'profile_event_summary_mv';
    const backfillSqls: string[] = [];

    let currentDate = new Date(endDate); // Start from endDate (most recent)

    while (currentDate >= startDate) {
      const dateStr = currentDate.toISOString().split('T')[0];

      const sql = `INSERT INTO ${targetTable}
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
      WHERE toDate(created_at) = '${dateStr}'
        AND profile_id != device_id
      GROUP BY project_id, profile_id, name, event_date`;

      backfillSqls.push(sql);
      currentDate.setDate(currentDate.getDate() - 1);
    }

    sqls.push(...backfillSqls);

    console.log(`📝 Generated ${sqls.length} daily INSERT statements`);
  } else {
    console.log('⚠️  No data found in events table since 2025-01-01, skipping backfill');
  }

  // Step 3: Write SQL to file for review
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

  console.log(`📄 SQL written to: ${sqlFilePath}`);
  console.log('');

  // Step 4: Execute if not in dry-run mode
  if (!process.argv.includes('--dry')) {
    console.log('🚀 Starting backfill execution...');
    console.log('⏱️  This may take a while depending on data volume');
    console.log('');

    let completed = 0;
    const total = sqls.length;

    for (const sql of sqls) {
      await runClickhouseMigrationCommands([sql]);
      completed++;

      // Show progress every 10%
      if (completed % Math.ceil(total / 10) === 0 || completed === total) {
        const percentage = Math.round((completed / total) * 100);
        console.log(`   Progress: ${completed}/${total} days (${percentage}%)`);
      }
    }

    console.log('');
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('   1. Verify data in profile_event_summary_mv');
    console.log('   2. Test cohort queries with historical data');
    console.log('   3. Check cohort member counts');
  } else {
    console.log('🔍 DRY RUN MODE: SQL generated but not executed');
    console.log('   Review the SQL file and run without --dry to execute');
  }
}

export async function down() {
  console.log('⚠️  Down migration not supported for backfill operations');
  console.log('   Data has been inserted into the MV and cannot be easily rolled back');
  console.log('   If needed, drop and recreate the MV: profile_event_summary_mv');
}
