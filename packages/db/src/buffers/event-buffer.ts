import { getSafeJson } from '@openpanel/json';
import {
  type Redis,
  getRedisCache,
  publishEvent,
} from '@openpanel/redis';
import { ch } from '../clickhouse/client';
import {
  type IClickhouseEvent,
  type IServiceEvent,
  transformEvent,
} from '../services/event.service';
import { BaseBuffer } from './base-buffer';

/**
 * Event Buffer
 *
 * 1. All events go into a single list buffer (event_buffer:queue)
 * 2. screen_view events are handled specially:
 *    - Store current screen_view as "last" for the session
 *    - When a new screen_view arrives, flush the previous one with calculated duration
 * 3. session_end events:
 *    - Retrieve the last screen_view (don't modify it)
 *    - Push both screen_view and session_end to buffer
 * 4. Flush: Process all events from the list buffer
 */
interface PendingEvent {
  event: IClickhouseEvent;
  eventJson: string;
  eventWithTimestamp?: string;
  type: 'regular' | 'screen_view' | 'session_end';
}

export class EventBuffer extends BaseBuffer {
  private batchSize = process.env.EVENT_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_BATCH_SIZE, 10)
    : 4000;
  private chunkSize = process.env.EVENT_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_CHUNK_SIZE, 10)
    : 1000;

  private microBatchIntervalMs = process.env.EVENT_BUFFER_MICRO_BATCH_MS
    ? Number.parseInt(process.env.EVENT_BUFFER_MICRO_BATCH_MS, 10)
    : 10;
  private microBatchMaxSize = process.env.EVENT_BUFFER_MICRO_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_MICRO_BATCH_SIZE, 10)
    : 100;

  private pendingEvents: PendingEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  /** Tracks consecutive flush failures for observability; reset on success. */
  private flushRetryCount = 0;

  private activeVisitorsExpiration = 60 * 5; // 5 minutes
  /** How often (ms) we refresh the heartbeat key + zadd per visitor. */
  private heartbeatRefreshMs = 60_000; // 1 minute
  private lastHeartbeat = new Map<string, number>();
  private queueKey = 'event_buffer:queue';
  protected bufferCounterKey = 'event_buffer:total_count';

  private scriptShas: {
    addScreenView?: string;
    addSessionEnd?: string;
  } = {};

  private getLastScreenViewKeyBySession(sessionId: string) {
    return `event_buffer:last_screen_view:session:${sessionId}`;
  }

  private getLastScreenViewKeyByProfile(projectId: string, profileId: string) {
    return `event_buffer:last_screen_view:profile:${projectId}:${profileId}`;
  }

  /**
   * Lua script for screen_view addition.
   * Uses GETDEL for atomic get-and-delete to prevent race conditions.
   *
   * KEYS[1] = last screen_view key (by session)
   * KEYS[2] = last screen_view key (by profile, may be empty)
   * KEYS[3] = queue key
   * KEYS[4] = buffer counter key
   * ARGV[1] = new event with timestamp as JSON: {"event": {...}, "ts": 123456}
   * ARGV[2] = TTL for last screen_view (1 hour)
   */
  private readonly addScreenViewScript = `
local sessionKey = KEYS[1]
local profileKey = KEYS[2]
local queueKey = KEYS[3]
local counterKey = KEYS[4]
local newEventData = ARGV[1]
local ttl = tonumber(ARGV[2])

local previousEventData = redis.call("GETDEL", sessionKey)

redis.call("SET", sessionKey, newEventData, "EX", ttl)

if profileKey and profileKey ~= "" then
  redis.call("SET", profileKey, newEventData, "EX", ttl)
end

if previousEventData then
  local prev = cjson.decode(previousEventData)
  local curr = cjson.decode(newEventData)
  
  if prev.ts and curr.ts then
    prev.event.duration = math.max(0, curr.ts - prev.ts)
  end
  
  redis.call("RPUSH", queueKey, cjson.encode(prev.event))
  redis.call("INCR", counterKey)
  return 1
end

return 0
`;

  /**
   * Lua script for session_end.
   * Uses GETDEL to atomically retrieve and delete the last screen_view.
   *
   * KEYS[1] = last screen_view key (by session)
   * KEYS[2] = last screen_view key (by profile, may be empty)
   * KEYS[3] = queue key
   * KEYS[4] = buffer counter key
   * ARGV[1] = session_end event JSON
   */
  private readonly addSessionEndScript = `
local sessionKey = KEYS[1]
local profileKey = KEYS[2]
local queueKey = KEYS[3]
local counterKey = KEYS[4]
local sessionEndJson = ARGV[1]

local previousEventData = redis.call("GETDEL", sessionKey)
local added = 0

if previousEventData then
  local prev = cjson.decode(previousEventData)
  redis.call("RPUSH", queueKey, cjson.encode(prev.event))
  redis.call("INCR", counterKey)
  added = added + 1
end

redis.call("RPUSH", queueKey, sessionEndJson)
redis.call("INCR", counterKey)
added = added + 1

if profileKey and profileKey ~= "" then
  redis.call("DEL", profileKey)
end

return added
`;

  constructor() {
    super({
      name: 'event',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
    this.loadScripts();
  }

  private async loadScripts() {
    try {
      const redis = getRedisCache();
      const [screenViewSha, sessionEndSha] = await Promise.all([
        redis.script('LOAD', this.addScreenViewScript),
        redis.script('LOAD', this.addSessionEndScript),
      ]);

      this.scriptShas.addScreenView = screenViewSha as string;
      this.scriptShas.addSessionEnd = sessionEndSha as string;

      this.logger.info('Loaded Lua scripts into Redis', {
        addScreenView: this.scriptShas.addScreenView,
        addSessionEnd: this.scriptShas.addSessionEnd,
      });
    } catch (error) {
      this.logger.error('Failed to load Lua scripts', { error });
    }
  }

  bulkAdd(events: IClickhouseEvent[]) {
    for (const event of events) {
      this.add(event);
    }
  }

  add(event: IClickhouseEvent) {
    const eventJson = JSON.stringify(event);

    let type: PendingEvent['type'] = 'regular';
    let eventWithTimestamp: string | undefined;

    if (event.session_id && event.name === 'screen_view') {
      type = 'screen_view';
      const timestamp = new Date(event.created_at || Date.now()).getTime();
      eventWithTimestamp = JSON.stringify({
        event: event,
        ts: timestamp,
      });
    } else if (event.session_id && event.name === 'session_end') {
      type = 'session_end';
    }

    const pendingEvent: PendingEvent = {
      event,
      eventJson,
      eventWithTimestamp,
      type,
    };

    this.pendingEvents.push(pendingEvent);

    if (this.pendingEvents.length >= this.microBatchMaxSize) {
      this.flushLocalBuffer();
      return;
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flushLocalBuffer();
      }, this.microBatchIntervalMs);
    }
  }

  private addToMulti(multi: ReturnType<Redis['multi']>, pending: PendingEvent) {
    const { event, eventJson, eventWithTimestamp, type } = pending;

    if (type === 'screen_view' && event.session_id) {
      const sessionKey = this.getLastScreenViewKeyBySession(event.session_id);
      const profileKey = event.profile_id
        ? this.getLastScreenViewKeyByProfile(event.project_id, event.profile_id)
        : '';

      this.evalScript(
        multi,
        'addScreenView',
        this.addScreenViewScript,
        4,
        sessionKey,
        profileKey,
        this.queueKey,
        this.bufferCounterKey,
        eventWithTimestamp!,
        '3600',
      );
    } else if (type === 'session_end' && event.session_id) {
      const sessionKey = this.getLastScreenViewKeyBySession(event.session_id);
      const profileKey = event.profile_id
        ? this.getLastScreenViewKeyByProfile(event.project_id, event.profile_id)
        : '';

      this.evalScript(
        multi,
        'addSessionEnd',
        this.addSessionEndScript,
        4,
        sessionKey,
        profileKey,
        this.queueKey,
        this.bufferCounterKey,
        eventJson,
      );
    } else {
      multi.rpush(this.queueKey, eventJson).incr(this.bufferCounterKey);
    }

    if (event.profile_id) {
      this.incrementActiveVisitorCount(
        multi,
        event.project_id,
        event.profile_id,
      );
    }
  }

  public async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushLocalBuffer();
  }

  private async flushLocalBuffer() {
    if (this.isFlushing || this.pendingEvents.length === 0) {
      return;
    }

    this.isFlushing = true;

    const eventsToFlush = this.pendingEvents;
    this.pendingEvents = [];

    try {
      const redis = getRedisCache();
      const multi = redis.multi();

      for (const pending of eventsToFlush) {
        this.addToMulti(multi, pending);
      }

      await multi.exec();

      this.flushRetryCount = 0;
      this.pruneHeartbeatMap();
    } catch (error) {
      // Re-queue failed events at the front to preserve order and avoid data loss
      this.pendingEvents = eventsToFlush.concat(this.pendingEvents);

      this.flushRetryCount += 1;
      this.logger.warn('Failed to flush local buffer to Redis; events re-queued', {
        error,
        eventCount: eventsToFlush.length,
        flushRetryCount: this.flushRetryCount,
      });
    } finally {
      this.isFlushing = false;
      // Events may have accumulated while we were flushing; schedule another flush if needed
      if (this.pendingEvents.length > 0 && !this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          this.flushLocalBuffer();
        }, this.microBatchIntervalMs);
      }
    }
  }

  private evalScript(
    multi: ReturnType<Redis['multi']>,
    scriptName: keyof typeof this.scriptShas,
    scriptContent: string,
    numKeys: number,
    ...args: (string | number)[]
  ) {
    const sha = this.scriptShas[scriptName];

    if (sha) {
      multi.evalsha(sha, numKeys, ...args);
    } else {
      multi.eval(scriptContent, numKeys, ...args);
      this.logger.warn(`Script ${scriptName} not loaded, using EVAL fallback`);
      this.loadScripts();
    }
  }

  async processBuffer() {
    const redis = getRedisCache();

    try {
      const queueEvents = await redis.lrange(
        this.queueKey,
        0,
        this.batchSize - 1,
      );

      if (queueEvents.length === 0) {
        this.logger.debug('No events to process');
        return;
      }

      const eventsToClickhouse: IClickhouseEvent[] = [];
      for (const eventStr of queueEvents) {
        const event = getSafeJson<IClickhouseEvent>(eventStr);
        if (event) {
          eventsToClickhouse.push(event);
        }
      }

      if (eventsToClickhouse.length === 0) {
        this.logger.debug('No valid events to process');
        return;
      }

      eventsToClickhouse.sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime(),
      );

      this.logger.info('Inserting events into ClickHouse', {
        totalEvents: eventsToClickhouse.length,
        chunks: Math.ceil(eventsToClickhouse.length / this.chunkSize),
      });

      for (const chunk of this.chunks(eventsToClickhouse, this.chunkSize)) {
        await ch.insert({
          table: 'events',
          values: chunk,
          format: 'JSONEachRow',
        });
      }

      const countByProject = new Map<string, number>();
      for (const event of eventsToClickhouse) {
        countByProject.set(event.project_id, (countByProject.get(event.project_id) ?? 0) + 1);
      }
      for (const [projectId, count] of countByProject) {
        publishEvent('events', 'batch', { projectId, count });
      }

      await redis
        .multi()
        .ltrim(this.queueKey, queueEvents.length, -1)
        .decrby(this.bufferCounterKey, queueEvents.length)
        .exec();

      this.logger.info('Processed events from Redis buffer', {
        batchSize: this.batchSize,
        eventsProcessed: eventsToClickhouse.length,
      });
    } catch (error) {
      this.logger.error('Error processing Redis buffer', { error });
    }
  }

  public async getLastScreenView(
    params:
      | {
          sessionId: string;
        }
      | {
          projectId: string;
          profileId: string;
        },
  ): Promise<IServiceEvent | null> {
    const redis = getRedisCache();

    let lastScreenViewKey: string;
    if ('sessionId' in params) {
      lastScreenViewKey = this.getLastScreenViewKeyBySession(params.sessionId);
    } else {
      lastScreenViewKey = this.getLastScreenViewKeyByProfile(
        params.projectId,
        params.profileId,
      );
    }

    const eventDataStr = await redis.get(lastScreenViewKey);

    if (eventDataStr) {
      const eventData = getSafeJson<{ event: IClickhouseEvent; ts: number }>(
        eventDataStr,
      );
      if (eventData?.event) {
        return transformEvent(eventData.event);
      }
    }

    return null;
  }

  public async getBufferSize() {
    return this.getBufferSizeWithCounter(async () => {
      const redis = getRedisCache();
      return await redis.llen(this.queueKey);
    });
  }

  private pruneHeartbeatMap() {
    const cutoff = Date.now() - this.activeVisitorsExpiration * 1000;
    for (const [key, ts] of this.lastHeartbeat) {
      if (ts < cutoff) {
        this.lastHeartbeat.delete(key);
      }
    }
  }

  private incrementActiveVisitorCount(
    multi: ReturnType<Redis['multi']>,
    projectId: string,
    profileId: string,
  ) {
    const key = `${projectId}:${profileId}`;
    const now = Date.now();
    const last = this.lastHeartbeat.get(key) ?? 0;

    if (now - last < this.heartbeatRefreshMs) {
      return;
    }

    this.lastHeartbeat.set(key, now);
    const zsetKey = `live:visitors:${projectId}`;
    const heartbeatKey = `live:visitor:${projectId}:${profileId}`;
    multi
      .zadd(zsetKey, now, profileId)
      .set(heartbeatKey, '1', 'EX', this.activeVisitorsExpiration);
  }

  public async getActiveVisitorCount(projectId: string): Promise<number> {
    const redis = getRedisCache();
    const zsetKey = `live:visitors:${projectId}`;
    const cutoff = Date.now() - this.activeVisitorsExpiration * 1000;

    const multi = redis.multi();
    multi
      .zremrangebyscore(zsetKey, '-inf', cutoff)
      .zcount(zsetKey, cutoff, '+inf');

    const [, count] = (await multi.exec()) as [
      [Error | null, any],
      [Error | null, number],
    ];

    return count[1] || 0;
  }
}
