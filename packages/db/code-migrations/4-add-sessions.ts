import fs from 'node:fs';
import path from 'node:path';
import {
  ch,
  chQuery,
  convertClickhouseDateToJs,
  formatClickhouseDate,
} from '@/clickhouse/client';
import type { IClickhouseEvent } from '@/services/event.service';
import type { IClickhouseSession } from '@/services/session.service';
import { getRedisCache } from '@openpanel/redis';
import {
  createTable,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { printBoxMessage } from './helpers';

export async function up() {
  const isSelfHosting = !!process.env.SELF_HOSTED;
  const isClustered = !isSelfHosting;

  const sqls: string[] = [
    ...createTable({
      name: 'sessions',
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
        '`screen_views` Array(String)',
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
        '`sign` Int8',
        '`version` UInt6',
      ],
      orderBy: ['project_id', 'toDate(created_at)', 'profile_id', 'id'],
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

  await createOldSessions();
}

async function createOldSessions() {
  let startDate = new Date('2022-01-01');
  while (true) {
    if (startDate > new Date()) {
      break;
    }

    const endDate = startDate;
    startDate = new Date(startDate.getTime() + 1000 * 60 * 60 * 24 * 30);
    const sql = `WITH unique_sessions AS (
                  SELECT distinct session_id FROM openpanel.events WHERE created_at <= '${formatClickhouseDate(startDate)}' and created_at > '${formatClickhouseDate(endDate)}' and session_id != '' AND session_id NOT LIKE 'session_%' AND project_id = 'strackr'
                )
                SELECT * FROM openpanel.events WHERE session_id IN (SELECT session_id FROM unique_sessions)
    `;

    const events = await chQuery<IClickhouseEvent>(sql);

    console.log('events', events);
    console.log('events', events.length);

    const stats = new Map<string, IClickhouseSession>();

    // Process events chronologically
    const sortedEvents = events.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    for (const event of sortedEvents) {
      if (
        !event.session_id ||
        ['session_start', 'session_end'].includes(event.name)
      ) {
        continue;
      }

      const sessionId = event.session_id;
      const existingSession = stats.get(sessionId);
      const eventDate = convertClickhouseDateToJs(event.created_at);

      if (!existingSession) {
        // Initialize new session
        stats.set(sessionId, {
          id: sessionId,
          project_id: event.project_id,
          profile_id: event.profile_id,
          device_id: event.device_id,
          event_count: event.name === 'screen_view' ? 0 : 1,
          screen_view_count: event.name === 'screen_view' ? 1 : 0,
          screen_views: event.name === 'screen_view' ? [event.path] : [],
          entry_path: event.path,
          entry_origin: event.origin,
          exit_path: event.path,
          exit_origin: event.origin,
          created_at: formatClickhouseDate(eventDate),
          ended_at: formatClickhouseDate(eventDate),
          referrer: event.referrer,
          referrer_name: event.referrer_name,
          referrer_type: event.referrer_type,
          country: event.country,
          device: event.device,
          os: event.os,
          browser: event.browser,
          brand: event.brand,
          model: event.model,
          utm_medium: event.properties['__query.utm_medium']
            ? String(event.properties['__query.utm_medium'])
            : '',
          utm_source: event.properties['__query.utm_source']
            ? String(event.properties['__query.utm_source'])
            : '',
          utm_campaign: event.properties['__query.utm_campaign']
            ? String(event.properties['__query.utm_campaign'])
            : '',
          browser_version: event.browser_version,
          os_version: event.os_version,
          region: event.region,
          city: event.city,
          longitude: event.longitude ?? null,
          latitude: event.latitude ?? null,
          utm_content: event.properties['__query.utm_content']
            ? String(event.properties['__query.utm_content'])
            : '',
          utm_term: event.properties['__query.utm_term']
            ? String(event.properties['__query.utm_term'])
            : '',
          is_bounce: true,
          duration: event.duration,
          revenue: 0,
          sign: 1,
          version: 1,
        });
      } else {
        // Create new version of the session
        const newSession: IClickhouseSession = {
          ...existingSession,
          sign: 1,
          version: existingSession.version + 1,
          ended_at: formatClickhouseDate(eventDate),
          exit_path: event.path,
          exit_origin: event.origin,
        };

        // Update session data
        if (event.profile_id && event.profile_id !== event.device_id) {
          newSession.profile_id = event.profile_id;
        }

        if (event.name === 'screen_view') {
          newSession.screen_views.push(event.path);
          newSession.screen_view_count += 1;
          if (newSession.screen_view_count > 1) {
            newSession.is_bounce = false;
          }
        } else {
          newSession.event_count += 1;
        }

        newSession.duration =
          eventDate.getTime() -
          convertClickhouseDateToJs(newSession.created_at).getTime();

        // Store both versions
        stats.set(sessionId, newSession);
      }
    }

    const values = Array.from(stats.values());

    await ch.insert({
      table: 'sessions',
      values,
      format: 'JSONEachRow',
    });

    const today = new Date();
    for (const value of values) {
      if (
        new Date(value.created_at).getFullYear() === today.getFullYear() &&
        new Date(value.created_at).getMonth() === today.getMonth() &&
        new Date(value.created_at).getDate() === today.getDate()
      ) {
        console.log('Adding session to Redis', value.id);
        await getRedisCache().set(
          `session:${value.id}`,
          JSON.stringify(value),
          'EX',
          60 * 60,
        );
      }
    }
  }
}
