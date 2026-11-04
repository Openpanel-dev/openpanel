import { TABLE_NAMES } from '../clickhouse/client';
import {
  createMaterializedView,
  dropTable,
  getExistingTables,
  hasMergeTreeSetting,
  runClickhouseMigrationCommands,
} from '../clickhouse/migration';
import { type CodeMigrationEnv, getIsCluster, writeSqlDump } from './helpers';

// Per-property breakdown of profile events, used when cohort event criteria
// filter on properties.<key> AND as a future fast path for property breakdowns
// in chart queries. populate: false — backfill ad-hoc.
export async function up(env: CodeMigrationEnv) {
  const replicatedVersion = '1';
  const existingTables = await getExistingTables();
  const isClustered = getIsCluster(env);
  // property_value is grouped on but sits outside the sorting key. ClickHouse
  // 26.7+ rejects that for AggregatingMergeTree unless allowed; older servers
  // do not know the setting and would reject the CREATE for naming it.
  const allowDimensionsOutsideSortingKey = await hasMergeTreeSetting(
    'allow_dimensions_outside_sorting_key'
  );

  const sqls: string[] = [];

  if (
    !(
      existingTables.includes(
        `${TABLE_NAMES.profile_event_property_summary_mv}_distributed`
      ) ||
      existingTables.includes(TABLE_NAMES.profile_event_property_summary_mv)
    )
  ) {
    sqls.push(
      ...createMaterializedView({
        name: TABLE_NAMES.profile_event_property_summary_mv,
        tableName: 'events',
        engine: 'AggregatingMergeTree()',
        orderBy: [
          'project_id',
          'profile_id',
          'name',
          'property_key',
          'event_date',
        ],
        partitionBy: 'toYYYYMM(event_date)',
        settings: allowDimensionsOutsideSortingKey
          ? { allow_dimensions_outside_sorting_key: 1 }
          : {},
        query: `SELECT
          project_id,
          profile_id,
          name,
          property_key,
          property_value,
          toStartOfDay(created_at) AS event_date,
          countState() AS event_count,
          minState(created_at) AS first_event_time,
          maxState(created_at) AS last_event_time
        FROM {events}
        ARRAY JOIN mapKeys(properties) AS property_key, mapValues(properties) AS property_value
        WHERE profile_id != device_id
          AND property_key != ''
          AND property_value != ''
        GROUP BY project_id, profile_id, name, property_key, property_value, event_date`,
        distributionHash: 'cityHash64(project_id, profile_id)',
        replicatedVersion,
        isClustered,
        populate: false,
      })
    );
  }

  writeSqlDump(import.meta.url, sqls);

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}

export async function down(env: CodeMigrationEnv) {
  const isClustered = getIsCluster(env);

  const sqls = [
    dropTable(
      `${TABLE_NAMES.profile_event_property_summary_mv}_distributed`,
      isClustered
    ),
    dropTable(
      `${TABLE_NAMES.profile_event_property_summary_mv}_replicated`,
      isClustered
    ),
    dropTable(TABLE_NAMES.profile_event_property_summary_mv, isClustered),
  ];

  await runClickhouseMigrationCommands(sqls);
}
