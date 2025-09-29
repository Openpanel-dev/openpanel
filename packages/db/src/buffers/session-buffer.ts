import { type Redis, getRedisCache, runEvery } from '@openpanel/redis';

import { toDots } from '@openpanel/common';
import { getSafeJson } from '@openpanel/json';
import { assocPath, clone } from 'ramda';
import { TABLE_NAMES, ch } from '../clickhouse/client';
import type { IClickhouseEvent } from '../services/event.service';
import type { IClickhouseSession } from '../services/session.service';
import { BaseBuffer } from './base-buffer';

export class SessionBuffer extends BaseBuffer {
  private batchSize = process.env.SESSION_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.SESSION_BUFFER_BATCH_SIZE, 10)
    : 1000;

  private readonly redisKey = 'session-buffer';
  private redis: Redis;
  constructor() {
    super({
      name: 'session',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
    this.redis = getRedisCache();
  }

  async getExistingSession(sessionId: string) {
    const hit = await this.redis.get(`session:${sessionId}`);

    if (hit) {
      return getSafeJson<IClickhouseSession>(hit);
    }

    return null;
  }

  async getSession(
    event: IClickhouseEvent,
  ): Promise<[IClickhouseSession] | [IClickhouseSession, IClickhouseSession]> {
    const existingSession = await this.getExistingSession(event.session_id);

    if (existingSession) {
      const oldSession = assocPath(['sign'], -1, clone(existingSession));
      const newSession = assocPath(['sign'], 1, clone(existingSession));

      newSession.ended_at = event.created_at;
      newSession.version = existingSession.version + 1;
      if (!newSession.entry_path && event.path) {
        newSession.entry_path = event.path;
      }
      if (!newSession.entry_origin && event.origin) {
        newSession.entry_origin = event.origin;
      }
      if (event.path) {
        newSession.exit_path = event.path;
      }
      if (event.origin) {
        newSession.exit_origin = event.origin;
      }
      const duration =
        new Date(newSession.ended_at).getTime() -
        new Date(newSession.created_at).getTime();
      if (duration > 0) {
        newSession.duration = duration;
      } else {
        this.logger.warn('Session duration is negative', {
          duration,
          event,
          session: newSession,
        });
      }
      newSession.properties = toDots({
        ...(event.properties || {}),
        ...(newSession.properties || {}),
      });
      // newSession.revenue += event.properties?.__revenue ?? 0;

      if (event.name === 'screen_view' && event.path) {
        newSession.screen_views.push(event.path);
        newSession.screen_view_count += 1;
      } else {
        newSession.event_count += 1;
      }

      if (newSession.screen_view_count > 1) {
        newSession.is_bounce = false;
      }

      // If the profile_id is set and it's different from the device_id, we need to update the profile_id
      if (event.profile_id && event.profile_id !== event.device_id) {
        newSession.profile_id = event.profile_id;
      }

      return [newSession, oldSession];
    }

    return [
      {
        id: event.session_id,
        is_bounce: true,
        profile_id: event.profile_id,
        project_id: event.project_id,
        device_id: event.device_id,
        created_at: event.created_at,
        ended_at: event.created_at,
        event_count: event.name === 'screen_view' ? 0 : 1,
        screen_view_count: event.name === 'screen_view' ? 1 : 0,
        screen_views: event.name === 'screen_view' ? [event.path] : [],
        entry_path: event.path,
        entry_origin: event.origin,
        exit_path: event.path,
        exit_origin: event.origin,
        revenue: 0,
        referrer: event.referrer,
        referrer_name: event.referrer_name,
        referrer_type: event.referrer_type,
        os: event.os,
        os_version: event.os_version,
        browser: event.browser,
        browser_version: event.browser_version,
        device: event.device,
        brand: event.brand,
        model: event.model,
        country: event.country,
        region: event.region,
        city: event.city,
        longitude: event.longitude ?? null,
        latitude: event.latitude ?? null,
        duration: event.duration,
        utm_medium: event.properties?.['__query.utm_medium']
          ? String(event.properties?.['__query.utm_medium'])
          : '',
        utm_source: event.properties?.['__query.utm_source']
          ? String(event.properties?.['__query.utm_source'])
          : '',
        utm_campaign: event.properties?.['__query.utm_campaign']
          ? String(event.properties?.['__query.utm_campaign'])
          : '',
        utm_content: event.properties?.['__query.utm_content']
          ? String(event.properties?.['__query.utm_content'])
          : '',
        utm_term: event.properties?.['__query.utm_term']
          ? String(event.properties?.['__query.utm_term'])
          : '',
        sign: 1,
        version: 1,
        properties: toDots(event.properties || {}),
      },
    ];
  }

  async add(event: IClickhouseEvent) {
    if (!event.session_id) {
      return;
    }

    if (['session_start', 'session_end'].includes(event.name)) {
      return;
    }

    try {
      // Plural since we will delete the old session with sign column
      const sessions = await this.getSession(event);
      const [newSession] = sessions;

      const multi = this.redis.multi();
      multi.set(
        `session:${newSession.id}`,
        JSON.stringify(newSession),
        'EX',
        60 * 60,
      );
      for (const session of sessions) {
        multi.rpush(this.redisKey, JSON.stringify(session));
      }
      await multi.exec();

      // Check buffer length
      const bufferLength = await this.redis.llen(this.redisKey);

      if (bufferLength >= this.batchSize) {
        await this.tryFlush();
      }
    } catch (error) {
      this.logger.error('Failed to add bot event', { error });
    }
  }

  async processBuffer() {
    try {
      // Get events from the start without removing them
      const events = await this.redis.lrange(
        this.redisKey,
        0,
        this.batchSize - 1,
      );

      if (events.length === 0) return;

      const sessions = events
        .map((e) => getSafeJson<IClickhouseSession>(e))
        .map((session) => {
          return {
            ...session,
            duration: Math.max(0, session?.duration || 0),
          };
        });

      for (const chunk of this.chunks(sessions, 1000)) {
        // Insert to ClickHouse
        await ch.insert({
          table: TABLE_NAMES.sessions,
          values: chunk,
          format: 'JSONEachRow',
        });
      }

      // Only remove events after successful insert
      await this.redis.ltrim(this.redisKey, events.length, -1);

      this.logger.info('Processed sessions', {
        count: events.length,
      });
    } catch (error) {
      this.logger.error('Failed to process buffer', { error });
    }
  }

  async getBufferSize() {
    return getRedisCache().llen(this.redisKey);
  }
}
