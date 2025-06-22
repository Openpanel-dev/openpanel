import fs from 'node:fs';
import path from 'node:path';
import { TABLE_NAMES, formatClickhouseDate } from '../src/clickhouse/client';
import {
  chMigrationClient,
  createTable,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

export async function up() {
  const isClustered = getIsCluster();

  const sqls: string[] = [
    ...createTable({
      name: 'sessions',
      engine: 'VersionedCollapsingMergeTree(sign, version)',
      columns: [
        '`id` String',
        '`project_id` String CODEC(ZSTD(3))',
        '`profile_id` String CODEC(ZSTD(3))',
        '`device_id` String CODEC(ZSTD(3))',
        '`created_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
        '`ended_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
        '`is_bounce` Bool',
        '`entry_origin` LowCardinality(String)',
        '`entry_path` String CODEC(ZSTD(3))',
        '`exit_origin` LowCardinality(String)',
        '`exit_path` String CODEC(ZSTD(3))',
        '`screen_view_count` Int32',
        '`revenue` Float64',
        '`event_count` Int32',
        '`duration` UInt32',
        '`country` LowCardinality(FixedString(2))',
        '`region` LowCardinality(String)',
        '`city` String',
        '`longitude` Nullable(Float32) CODEC(Gorilla, LZ4)',
        '`latitude` Nullable(Float32) CODEC(Gorilla, LZ4)',
        '`device` LowCardinality(String)',
        '`brand` LowCardinality(String)',
        '`model` LowCardinality(String)',
        '`browser` LowCardinality(String)',
        '`browser_version` LowCardinality(String)',
        '`os` LowCardinality(String)',
        '`os_version` LowCardinality(String)',
        '`utm_medium` String CODEC(ZSTD(3))',
        '`utm_source` String CODEC(ZSTD(3))',
        '`utm_campaign` String CODEC(ZSTD(3))',
        '`utm_content` String CODEC(ZSTD(3))',
        '`utm_term` String CODEC(ZSTD(3))',
        '`referrer` String CODEC(ZSTD(3))',
        '`referrer_name` String CODEC(ZSTD(3))',
        '`referrer_type` LowCardinality(String)',
        '`sign` Int8',
        '`version` UInt64',
        '`properties` Map(String, String) CODEC(ZSTD(3))',
      ],
      orderBy: ['project_id', 'id', 'toDate(created_at)', 'profile_id'],
      partitionBy: 'toYYYYMM(created_at)',
      settings: {
        index_granularity: 8192,
      },
      distributionHash:
        'cityHash64(project_id, toString(toStartOfHour(created_at)))',
      replicatedVersion: '1',
      isClustered,
    }),
  ];

  sqls.push(...(await createOldSessions()));

  fs.writeFileSync(
    path.join(__filename.replace('.ts', '.sql')),
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

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}

async function createOldSessions() {
  async function getFirstEventAt() {
    const defaultDate = new Date('2024-03-01');
    try {
      const res = await chMigrationClient.query({
        query: `SELECT min(created_at) as created_at, count() as count FROM ${TABLE_NAMES.events}`,
        format: 'JSONEachRow',
      });
      const json = await res.json<{ created_at: string; count: string }>();
      const row = json[0];
      if (!row || row.count === '0') {
        return null;
      }
      return new Date(row.created_at);
    } catch (e) {
      return defaultDate;
    }
  }

  let startDate = await getFirstEventAt();

  if (!startDate) {
    return [];
  }

  const endDate = new Date();
  const sqls: string[] = [];
  while (startDate <= endDate) {
    const endDate = startDate;
    startDate = new Date(startDate.getTime() + 1000 * 60 * 60 * 24);
    sqls.push(`
      INSERT INTO openpanel.sessions
        WITH unique_sessions AS (
          SELECT session_id, min(created_at) as first_event_at
          FROM openpanel.events
          WHERE 
            created_at BETWEEN '${formatClickhouseDate(endDate)}' AND '${formatClickhouseDate(startDate)}'
            AND session_id != ''
          GROUP BY session_id
          HAVING first_event_at >= '${formatClickhouseDate(endDate)}'
        )
        SELECT 
          any(e.session_id) as id,
          any(e.project_id) as project_id,
          if(any(nullIf(e.profile_id, e.device_id)) IS NULL, any(e.profile_id), any(nullIf(e.profile_id, e.device_id))) as profile_id,
          any(e.device_id) as device_id,
          argMin(e.created_at, e.created_at) as created_at,
          argMax(e.created_at, e.created_at) as ended_at,
          if(
            argMaxIf(e.properties['__bounce'], e.created_at, e.name = 'session_end') = '',
            if(countIf(e.name = 'screen_view') > 1, true, false),
            argMaxIf(e.properties['__bounce'], e.created_at, e.name = 'session_end') = 'true'
          ) as is_bounce,
          argMinIf(e.origin, e.created_at, e.name = 'session_start') as entry_origin,
          argMinIf(e.path, e.created_at, e.name = 'session_start') as entry_path,
          argMaxIf(e.origin, e.created_at, e.name = 'session_end' OR e.name = 'screen_view') as exit_origin,
          argMaxIf(e.path, e.created_at, e.name = 'session_end' OR e.name = 'screen_view') as exit_path,
          countIf(e.name = 'screen_view') as screen_view_count,
          0 as revenue,
          countIf(e.name != 'screen_view' AND e.name != 'session_start' AND e.name != 'session_end') as event_count,
          sumIf(e.duration, name = 'session_end') AS duration,
          argMinIf(e.country, e.created_at, e.name = 'session_start') as country,
          argMinIf(e.region, e.created_at, e.name = 'session_start') as region,
          argMinIf(e.city, e.created_at, e.name = 'session_start') as city,
          argMinIf(e.longitude, e.created_at, e.name = 'session_start') as longitude,
          argMinIf(e.latitude, e.created_at, e.name = 'session_start') as latitude,
          argMinIf(e.device, e.created_at, e.name = 'session_start') as device,
          argMinIf(e.brand, e.created_at, e.name = 'session_start') as brand,
          argMinIf(e.model, e.created_at, e.name = 'session_start') as model,
          argMinIf(e.browser, e.created_at, e.name = 'session_start') as browser,
          argMinIf(e.browser_version, e.created_at, e.name = 'session_start') as browser_version,
          argMinIf(e.os, e.created_at, e.name = 'session_start') as os,
          argMinIf(e.os_version, e.created_at, e.name = 'session_start') as os_version,
          argMinIf(e.properties['__utm_medium'], e.created_at, e.name = 'session_start') as utm_medium,
          argMinIf(e.properties['__utm_source'], e.created_at, e.name = 'session_start') as utm_source,
          argMinIf(e.properties['__utm_campaign'], e.created_at, e.name = 'session_start') as utm_campaign,
          argMinIf(e.properties['__utm_content'], e.created_at, e.name = 'session_start') as utm_content,
          argMinIf(e.properties['__utm_term'], e.created_at, e.name = 'session_start') as utm_term,
          argMinIf(e.referrer, e.created_at, e.name = 'session_start') as referrer,
          argMinIf(e.referrer_name, e.created_at, e.name = 'session_start') as referrer_name,
          argMinIf(e.referrer_type, e.created_at, e.name = 'session_start') as referrer_type,
          1 as sign,
          1 as version,
          argMinIf(e.properties, e.created_at, e.name = 'session_start') as properties
        FROM events e
        WHERE 
          e.session_id IN (SELECT session_id FROM unique_sessions)
          AND e.created_at BETWEEN '${formatClickhouseDate(endDate)}' AND '${formatClickhouseDate(new Date(startDate.getTime() + 1000 * 60 * 60 * 24 * 3))}'
        GROUP BY e.session_id
      `);
  }

  return sqls;
}
