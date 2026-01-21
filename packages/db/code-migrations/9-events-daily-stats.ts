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
 * 1. Create events_daily_stats without POPULATE (starts capturing new data)
 * 2. Backfill ALL historical data from events table using day-by-day batch inserts
 */
export async function up() {
  const isClustered = getIsCluster();
  const sqls: string[] = [];

  // Step 1: Create MV without POPULATE (so it starts capturing new data immediately)
  const mvStatements = createMaterializedView({
    name: 'events_daily_stats',
    tableName: 'events',
    orderBy: ['project_id', 'name', 'date'],
    partitionBy: 'toYYYYMMDD(date)',
    query: `SELECT
      project_id,
      name,
      toDate(created_at) as date,
      uniqState(profile_id) as unique_profiles_state,
      uniqState(session_id) as unique_sessions_state,
      count() as event_count
    FROM {events}
    GROUP BY project_id, name, date`,
    distributionHash: 'cityHash64(project_id, name, date)',
    replicatedVersion: '1',
    isClustered,
    populate: false, // Don't use POPULATE to avoid timeout
  });

  sqls.push(...mvStatements);

  // Step 2: Backfill all historical data from events table
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
    const startDate = new Date(dataRange[0].min_date);
    const endDate = new Date(dataRange[0].max_date);
    endDate.setDate(endDate.getDate() + 1); // Make it exclusive (next day)

    const totalEvents = Number(dataRange[0].total_events);
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    console.log('========================================');
    console.log('📊 Backfill Plan:');
    console.log(`   Start Date: ${startDate.toISOString().split('T')[0]}`);
    console.log(`   End Date:   ${dataRange[0].max_date}`);
    console.log(`   Days:       ${daysDiff} days`);
    console.log(`   Events:     ${totalEvents.toLocaleString()} total events`);
    console.log('========================================');
    console.log('');

    // Use day-by-day batching to avoid timeouts
    const backfillSqls = moveDataBetweenTables({
      from: 'events',
      to: isClustered ? 'events_daily_stats_replicated' : 'events_daily_stats',
      columns: [
        'project_id',
        'name',
        'toDate(created_at) as date',
        'uniqState(profile_id) as unique_profiles_state',
        'uniqState(session_id) as unique_sessions_state',
        'count() as event_count',
      ],
      batch: {
        startDate,
        endDate,
        column: 'toDate(created_at)',
        interval: 'day',
        transform: (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        },
      },
    });

    // Wrap each INSERT with GROUP BY since we're selecting aggregates
    const groupedBackfillSqls = backfillSqls.map((sql) => {
      // Extract the WHERE clause and modify the query structure
      const whereMatch = sql.match(/WHERE (.+)$/);
      if (!whereMatch) return sql;

      const whereClause = whereMatch[1];
      const [insertPart] = sql.split('SELECT');

      return `${insertPart}
      SELECT
        project_id,
        name,
        toDate(created_at) as date,
        uniqState(profile_id) as unique_profiles_state,
        uniqState(session_id) as unique_sessions_state,
        count() as event_count
      FROM events
      WHERE ${whereClause}
      GROUP BY project_id, name, date`;
    });

    sqls.push(...groupedBackfillSqls);
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

  console.log(`Generated ${sqls.length} SQL statements`);
  console.log(`SQL written to: ${sqlFilePath}`);

  // Execute if not in dry-run mode
  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
    console.log('✅ Migration completed successfully!');
    console.log('Next steps: Verify data in events_daily_stats');
  } else {
    console.log('Dry-run mode: SQL generated but not executed');
  }
}
