import fs from 'node:fs';
import path from 'node:path';
import { formatClickhouseDate } from '../src/clickhouse/client';
import {
  createDatabase,
  createMaterializedView,
  createTable,
  dropTable,
  getExistingTables,
  moveDataBetweenTables,
  renameTable,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsSelfHosting, printBoxMessage } from './helpers';

export async function up() {
  const replicatedVersion = '1';
  const existingTables = await getExistingTables();
  const hasSelfHosting = existingTables.includes('self_hosting_distributed');
  const hasEvents = existingTables.includes('events_distributed');
  const hasEventsV2 = existingTables.includes('events_v2');
  const hasEventsBots = existingTables.includes('events_bots_distributed');
  const hasProfiles = existingTables.includes('profiles_distributed');
  const hasProfileAliases = existingTables.includes(
    'profile_aliases_distributed',
  );

  const isSelfHosting = getIsSelfHosting();
  const isClustered = !isSelfHosting;

  const isSelfHostingPostCluster =
    existingTables.includes('events_replicated') && isSelfHosting;

  const isSelfHostingPreCluster =
    !isSelfHostingPostCluster &&
    existingTables.includes('events_v2') &&
    isSelfHosting;

  const isSelfHostingOld = existingTables.length !== 0 && isSelfHosting;

  const sqls: string[] = [];

  // Move tables to old names if they exists
  if (isSelfHostingOld) {
    sqls.push(
      ...existingTables
        .filter((table) => {
          return (
            !table.endsWith('_tmp') && !existingTables.includes(`${table}_tmp`)
          );
        })
        .flatMap((table) => {
          return renameTable({
            from: table,
            to: `${table}_tmp`,
            isClustered: false,
          });
        }),
    );
  }

  sqls.push(
    createDatabase('openpanel', isClustered),
    // Create new tables
    ...createTable({
      name: 'self_hosting',
      columns: ['`created_at` Date', '`domain` String', '`count` UInt64'],
      orderBy: ['domain', 'created_at'],
      partitionBy: 'toYYYYMM(created_at)',
      distributionHash: 'cityHash64(domain)',
      replicatedVersion,
      isClustered,
    }),
    ...createTable({
      name: 'events',
      columns: [
        '`id` UUID DEFAULT generateUUIDv4()',
        '`name` LowCardinality(String)',
        '`sdk_name` LowCardinality(String)',
        '`sdk_version` LowCardinality(String)',
        '`device_id` String CODEC(ZSTD(3))',
        '`profile_id` String CODEC(ZSTD(3))',
        '`project_id` String CODEC(ZSTD(3))',
        '`session_id` String CODEC(LZ4)',
        '`path` String CODEC(ZSTD(3))',
        '`origin` String CODEC(ZSTD(3))',
        '`referrer` String CODEC(ZSTD(3))',
        '`referrer_name` String CODEC(ZSTD(3))',
        '`referrer_type` LowCardinality(String)',
        '`duration` UInt64 CODEC(Delta(4), LZ4)',
        '`properties` Map(String, String) CODEC(ZSTD(3))',
        '`created_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
        '`country` LowCardinality(FixedString(2))',
        '`city` String',
        '`region` LowCardinality(String)',
        '`longitude` Nullable(Float32) CODEC(Gorilla, LZ4)',
        '`latitude` Nullable(Float32) CODEC(Gorilla, LZ4)',
        '`os` LowCardinality(String)',
        '`os_version` LowCardinality(String)',
        '`browser` LowCardinality(String)',
        '`browser_version` LowCardinality(String)',
        '`device` LowCardinality(String)',
        '`brand` LowCardinality(String)',
        '`model` LowCardinality(String)',
        '`imported_at` Nullable(DateTime) CODEC(Delta(4), LZ4)',
      ],
      indices: [
        'INDEX idx_name name TYPE bloom_filter GRANULARITY 1',
        "INDEX idx_properties_bounce properties['__bounce'] TYPE set(3) GRANULARITY 1",
        'INDEX idx_origin origin TYPE bloom_filter(0.05) GRANULARITY 1',
        'INDEX idx_path path TYPE bloom_filter(0.01) GRANULARITY 1',
      ],
      orderBy: ['project_id', 'toDate(created_at)', 'profile_id', 'name'],
      partitionBy: 'toYYYYMM(created_at)',
      settings: {
        index_granularity: 8192,
      },
      distributionHash:
        'cityHash64(project_id, toString(toStartOfHour(created_at)))',
      replicatedVersion,
      isClustered,
    }),
    ...createTable({
      name: 'events_bots',
      columns: [
        '`id` UUID DEFAULT generateUUIDv4()',
        '`project_id` String',
        '`name` String',
        '`type` String',
        '`path` String',
        '`created_at` DateTime64(3)',
      ],
      orderBy: ['project_id', 'created_at'],
      settings: {
        index_granularity: 8192,
      },
      distributionHash:
        'cityHash64(project_id, toString(toStartOfDay(created_at)))',
      replicatedVersion,
      isClustered,
    }),
    ...createTable({
      name: 'profiles',
      columns: [
        '`id` String CODEC(ZSTD(3))',
        '`is_external` Bool',
        '`first_name` String CODEC(ZSTD(3))',
        '`last_name` String CODEC(ZSTD(3))',
        '`email` String CODEC(ZSTD(3))',
        '`avatar` String CODEC(ZSTD(3))',
        '`properties` Map(String, String) CODEC(ZSTD(3))',
        '`project_id` String CODEC(ZSTD(3))',
        '`created_at` DateTime64(3) CODEC(Delta(4), LZ4)',
      ],
      indices: [
        'INDEX idx_first_name first_name TYPE bloom_filter GRANULARITY 1',
        'INDEX idx_last_name last_name TYPE bloom_filter GRANULARITY 1',
        'INDEX idx_email email TYPE bloom_filter GRANULARITY 1',
      ],
      engine: 'ReplacingMergeTree(created_at)',
      orderBy: ['project_id', 'id'],
      partitionBy: 'toYYYYMM(created_at)',
      settings: {
        index_granularity: 8192,
      },
      distributionHash: 'cityHash64(project_id)',
      replicatedVersion,
      isClustered,
    }),
    ...createTable({
      name: 'profile_aliases',
      columns: [
        '`project_id` String',
        '`profile_id` String',
        '`alias` String',
        '`created_at` DateTime',
      ],
      orderBy: ['project_id', 'profile_id', 'alias', 'created_at'],
      settings: {
        index_granularity: 8192,
      },
      distributionHash: 'cityHash64(project_id)',
      replicatedVersion,
      isClustered,
    }),

    // Create materialized views
    ...createMaterializedView({
      name: 'dau_mv',
      tableName: 'events',
      orderBy: ['project_id', 'date'],
      partitionBy: 'toYYYYMMDD(date)',
      query: `SELECT
        toDate(created_at) as date,
        uniqState(profile_id) as profile_id,
        project_id
      FROM {events}
      GROUP BY date, project_id`,
      distributionHash: 'cityHash64(project_id, date)',
      replicatedVersion,
      isClustered,
    }),
    ...createMaterializedView({
      name: 'cohort_events_mv',
      tableName: 'events',
      orderBy: ['project_id', 'name', 'created_at', 'profile_id'],
      query: `SELECT
        project_id,
        name,
        toDate(created_at) AS created_at,
        profile_id,
        COUNT() AS event_count
      FROM {events}
      WHERE profile_id != device_id
      GROUP BY project_id, name, created_at, profile_id`,
      distributionHash: 'cityHash64(project_id, toString(created_at))',
      replicatedVersion,
      isClustered,
    }),
    ...createMaterializedView({
      name: 'distinct_event_names_mv',
      tableName: 'events',
      orderBy: ['project_id', 'name', 'created_at'],
      query: `SELECT
        project_id,
        name,
        max(created_at) AS created_at,
        count() AS event_count
      FROM {events}
      GROUP BY project_id, name`,
      distributionHash: 'cityHash64(name, created_at)',
      replicatedVersion,
      isClustered,
    }),
    ...createMaterializedView({
      name: 'event_property_values_mv',
      tableName: 'events',
      orderBy: ['project_id', 'name', 'property_key', 'property_value'],
      query: `SELECT
        project_id,
        name,
        key_value.keys as property_key,
        key_value.values as property_value,
        created_at
      FROM (
        SELECT
          project_id,
          name,
          untuple(arrayJoin(properties)) as key_value,
          max(created_at) as created_at
        FROM {events}
        GROUP BY project_id, name, key_value
      )
      WHERE property_value != ''
        AND property_key != ''
        AND property_key NOT IN ('__duration_from', '__properties_from')
      GROUP BY project_id, name, property_key, property_value, created_at`,
      distributionHash: 'cityHash64(project_id, name)',
      replicatedVersion,
      isClustered,
    }),
  );

  if (isSelfHostingPostCluster) {
    sqls.push(
      // Move data between tables
      ...(hasSelfHosting
        ? moveDataBetweenTables({
            from: 'self_hosting_replicated_tmp',
            to: 'self_hosting',
            batch: {
              column: 'created_at',
              interval: 'month',
              transform: (date) => {
                return formatClickhouseDate(date, true);
              },
            },
          })
        : []),
      ...(hasProfileAliases
        ? moveDataBetweenTables({
            from: 'profile_aliases_replicated_tmp',
            to: 'profile_aliases',
            batch: {
              column: 'created_at',
              interval: 'month',
            },
          })
        : []),
      ...(hasEventsBots
        ? moveDataBetweenTables({
            from: 'events_bots_replicated_tmp',
            to: 'events_bots',
            batch: {
              column: 'created_at',
              interval: 'month',
            },
          })
        : []),
      ...(hasProfiles
        ? moveDataBetweenTables({
            from: 'profiles_replicated_tmp',
            to: 'profiles',
            batch: {
              column: 'created_at',
              interval: 'month',
            },
          })
        : []),
      ...(hasEvents
        ? moveDataBetweenTables({
            from: 'events_replicated_tmp',
            to: 'events',
            batch: {
              column: 'created_at',
              interval: 'week',
            },
          })
        : []),
    );
  }

  if (isSelfHostingPreCluster) {
    sqls.push(
      ...(hasEventsV2
        ? moveDataBetweenTables({
            from: 'events_v2',
            to: 'events',
            batch: {
              column: 'created_at',
              interval: 'week',
            },
          })
        : []),
    );
  }

  fs.writeFileSync(
    path.join(__dirname, '3-init-ch.sql'),
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

  printBoxMessage('Will start migration for self-hosting setup.', [
    'This will move all data from the old tables to the new ones.',
    'This might take a while depending on your server.',
  ]);

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }

  if (isSelfHostingOld) {
    printBoxMessage(
      '⚠️ Please run the following command to clean up unused tables:',
      existingTables.map(
        (table) =>
          `docker compose exec -it op-ch clickhouse-client --query "${dropTable(
            `openpanel.${table}_tmp`,
            false,
          )}"`,
      ),
    );
  }
}
