import { getSafeJson } from '@openpanel/json';
import { getRedisCache, type Redis } from '@openpanel/redis';
import { assocPath, clone } from 'ramda';
import { ch, TABLE_NAMES } from '../clickhouse/client';
import type { IClickhouseEvent } from '../services/event.service';
import type { IClickhouseSession } from '../services/session.service';
import { BaseBuffer } from './base-buffer';

export class SessionBuffer extends BaseBuffer {
  private batchSize = process.env.SESSION_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.SESSION_BUFFER_BATCH_SIZE, 10)
    : 1000;
  private chunkSize = process.env.SESSION_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.SESSION_BUFFER_CHUNK_SIZE, 10)
    : 1000;

  private readonly squashEnabled =
    process.env.SESSION_BUFFER_SQUASH !== 'false' &&
    process.env.SESSION_BUFFER_SQUASH !== '0';

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

  public async getExistingSession(
    options:
      | {
          sessionId: string;
        }
      | {
          projectId: string;
          profileId: string;
        }
  ) {
    let hit: string | null = null;
    if ('sessionId' in options) {
      hit = await this.redis.get(`session:${options.sessionId}`);
    } else {
      const value = await this.redis.get(
        `session:${options.projectId}:${options.profileId}`
      );
      if (!value) return null;

      // Backward compat: old keys stored full JSON, new keys store just the sessionId
      if (value.startsWith('{')) {
        return getSafeJson<IClickhouseSession>(value);
      }

      hit = await this.redis.get(`session:${value}`);
    }

    if (hit) {
      return getSafeJson<IClickhouseSession>(hit);
    }

    return null;
  }

  async getSession(
    event: IClickhouseEvent
  ): Promise<[IClickhouseSession] | [IClickhouseSession, IClickhouseSession]> {
    const existingSession = await this.getExistingSession({
      sessionId: event.session_id,
    });

    if (existingSession) {
      const oldSession = assocPath(['sign'], -1, clone(existingSession));
      const newSession = assocPath(['sign'], 1, clone(existingSession));

      newSession.version = existingSession.version + 1;

      // Events can arrive out of order (client-side batching, retries, offline
      // queueing). Treat the session window as [min(event ts), max(event ts)]
      // so duration stays non-negative and entry/exit reflect actual order.
      const eventTime = new Date(event.created_at).getTime();
      const startTime = new Date(newSession.created_at).getTime();
      const endTime = new Date(newSession.ended_at).getTime();

      if (eventTime >= endTime) {
        newSession.ended_at = event.created_at;
        if (event.path) {
          newSession.exit_path = event.path;
        }
        if (event.origin) {
          newSession.exit_origin = event.origin;
        }
      }

      if (eventTime < startTime) {
        newSession.created_at = event.created_at;
        if (event.path) {
          newSession.entry_path = event.path;
        }
        if (event.origin) {
          newSession.entry_origin = event.origin;
        }
      } else {
        if (!newSession.entry_path && event.path) {
          newSession.entry_path = event.path;
        }
        if (!newSession.entry_origin && event.origin) {
          newSession.entry_origin = event.origin;
        }
      }

      newSession.duration =
        new Date(newSession.ended_at).getTime() -
        new Date(newSession.created_at).getTime();

      const addedRevenue = event.name === 'revenue' ? (event.revenue ?? 0) : 0;
      newSession.revenue = (newSession.revenue ?? 0) + addedRevenue;

      if (event.name === 'screen_view' && event.path) {
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

      if (event.groups) {
        newSession.groups = [
          ...new Set([...(newSession.groups ?? []), ...event.groups]),
        ];
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
        groups: event.groups,
        created_at: event.created_at,
        ended_at: event.created_at,
        event_count: event.name === 'screen_view' ? 0 : 1,
        screen_view_count: event.name === 'screen_view' ? 1 : 0,
        entry_path: event.path,
        entry_origin: event.origin,
        exit_path: event.path,
        exit_origin: event.origin,
        revenue: event.name === 'revenue' ? (event.revenue ?? 0) : 0,
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
      },
    ];
  }

  protected getRedisListKey(): string {
    return this.redisKey;
  }

  async add(event: IClickhouseEvent) {
    if (!event.session_id) {
      return;
    }

    if (['session_start', 'session_end'].includes(event.name)) {
      return;
    }

    return this.timeAdd(async () => {
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
        if (newSession.profile_id) {
          multi.set(
            `session:${newSession.project_id}:${newSession.profile_id}`,
            newSession.id,
            'EX',
            60 * 60,
          );
        }
        for (const session of sessions) {
          multi.rpush(this.redisKey, JSON.stringify(session));
        }
        // Append LLEN at the end so we can read ground-truth queue length
        // from the exec result without an extra round-trip.
        multi.llen(this.redisKey);
        const result = await multi.exec();

        const llenIndex = (result?.length ?? 1) - 1;
        const bufferLength = (result?.[llenIndex]?.[1] as number) ?? 0;

        if (bufferLength >= this.batchSize) {
          await this.tryFlush({ trigger: 'add' });
        }
      } catch (error) {
        this.logger.error({ err: error }, 'Failed to add session');
      }
    });
  }

  /**
   * Squash multiple (sign=-1, sign=+1) pairs for the same session id into
   * just the boundary rows: the oldest -1 (cancels the previous CH state)
   * and the newest +1 (the final state). Single-row sessions (no update
   * pair yet) pass through unchanged.
   *
   * Correctness depends on the invariant maintained by `getSession`: every
   * update for an existing session emits exactly one -1 at version V and
   * one +1 at V+1, where V is the existing version. The oldest -1 in the
   * batch cancels CH's previous +1, and the newest +1 becomes the new
   * canonical row. Intermediate (-1, +1) pairs cancel each other in CH
   * either way — keeping them is wasted work.
   */
  private squashSessionsByVersion(
    sessions: IClickhouseSession[],
  ): IClickhouseSession[] {
    if (sessions.length <= 1) return sessions;

    const grouped = new Map<string, IClickhouseSession[]>();
    for (const s of sessions) {
      const key = s.id;
      const arr = grouped.get(key);
      if (arr) arr.push(s);
      else grouped.set(key, [s]);
    }

    let squashedCount = 0;
    const out: IClickhouseSession[] = [];

    for (const entries of grouped.values()) {
      if (entries.length === 1) {
        out.push(entries[0]!);
        continue;
      }
      let oldestNeg: IClickhouseSession | null = null;
      let newestPos: IClickhouseSession | null = null;
      for (const e of entries) {
        if (e.sign === -1) {
          if (!oldestNeg || e.version < oldestNeg.version) {
            oldestNeg = e;
          }
        } else if (e.sign === 1) {
          if (!newestPos || e.version > newestPos.version) {
            newestPos = e;
          }
        }
      }
      const emitted: IClickhouseSession[] = [];
      if (oldestNeg) emitted.push(oldestNeg);
      if (newestPos) emitted.push(newestPos);
      squashedCount += entries.length - emitted.length;
      out.push(...emitted);
    }

    if (squashedCount > 0) {
      this.logger.debug(
        {
          inputRows: sessions.length,
          outputRows: out.length,
          dropped: squashedCount,
          uniqueSessions: grouped.size,
        },
        'Session batch squashed',
      );
    }

    console.log(
      squashedCount > 0 ? 'Session batch squashed' : 'Session batch not squashed',
      { inputRows: sessions.length, outputRows: out.length, dropped: squashedCount },
    );

    return out;
  }

  async processBuffer() {
    const lrangeStart = performance.now();
    const events = await this.redis.lrange(
      this.redisKey,
      0,
      this.batchSize - 1
    );
    const lrangeMs = performance.now() - lrangeStart;

    if (events.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return;
    }

    const parsed: IClickhouseSession[] = [];
    for (const raw of events) {
      const session = getSafeJson<IClickhouseSession>(raw);
      if (!session) continue;
      parsed.push({
        ...session,
        duration: Math.max(0, session.duration || 0),
      });
    }

    // A single high-activity session can produce many (sign=-1, sign=+1)
    // pairs within one flush window — each event for that session adds a
    // pair. The VersionedCollapsingMergeTree on `sessions` will collapse
    // them at merge time, so the final state is correct either way. But
    // inserting all the intermediate rows costs network bytes, gzip CPU,
    // CH ingest work, and CH merge work.
    //
    // We can squash within the batch and only insert the boundary rows:
    // the oldest sign=-1 (which cancels the previous CH state) and the
    // newest sign=+1 (the final state). Same end result, fewer rows.
    //
    // Set SESSION_BUFFER_SQUASH=false to disable as a safety hatch.
    const sessions = this.squashEnabled
      ? this.squashSessionsByVersion(parsed)
      : parsed;

    const chStart = performance.now();
    await this.parallelLimit(this.chunks(sessions, this.chunkSize), (chunk) =>
      ch.insert({
        table: TABLE_NAMES.sessions,
        values: chunk,
        format: 'JSONEachRow',
        clickhouse_settings: {
          async_insert: 1,
          parallel_view_processing: 1
        }
      }),
    );
    const chInsertMs = performance.now() - chStart;

    const trimStart = performance.now();
    await this.redis.ltrim(this.redisKey, events.length, -1);
    const trimMs = performance.now() - trimStart;

    this.reportFlushStats({
      rowsProcessed: events.length,
      phases: { lrangeMs, chInsertMs, trimMs },
    });
  }
}
