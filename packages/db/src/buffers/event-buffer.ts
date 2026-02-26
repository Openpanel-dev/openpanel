import { getSafeJson } from '@openpanel/json';
import {
  type Redis,
  getRedisCache,
  getRedisPub,
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
 * Simplified Event Buffer
 *
 * Rules:
 * 1. All events go into a single list buffer (event_buffer:queue)
 * 2. screen_view events are handled specially:
 *    - Store current screen_view as "last" for the session
 *    - When a new screen_view arrives, flush the previous one with calculated duration
 * 3. session_end events:
 *    - Retrieve the last screen_view (don't modify it)
 *    - Push both screen_view and session_end to buffer
 * 4. Flush: Simply process all events from the list buffer
 *
 * Optimizations:
 * - Micro-batching: Events are buffered locally and flushed every 10ms to reduce Redis round-trips
 * - Batched publishes: All PUBLISH commands are included in the multi pipeline
 * - Simplified active visitor tracking: Only uses ZADD (removed redundant heartbeat SET)
 */

// Pending event for local buffer
interface PendingEvent {
  event: IClickhouseEvent;
  eventJson: string;
  eventWithTimestamp?: string;
  type: 'regular' | 'screen_view' | 'session_end';
}

export class EventBuffer extends BaseBuffer {
  // Configurable limits
  private batchSize = process.env.EVENT_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_BATCH_SIZE, 10)
    : 4000;
  private chunkSize = process.env.EVENT_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_CHUNK_SIZE, 10)
    : 1000;

  // Micro-batching configuration
  private microBatchIntervalMs = process.env.EVENT_BUFFER_MICRO_BATCH_MS
    ? Number.parseInt(process.env.EVENT_BUFFER_MICRO_BATCH_MS, 10)
    : 10; // Flush every 10ms by default
  private microBatchMaxSize = process.env.EVENT_BUFFER_MICRO_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_MICRO_BATCH_SIZE, 10)
    : 100; // Or when we hit 100 events

  // Local event buffer for micro-batching
  private pendingEvents: PendingEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;

  // Throttled publish configuration
  private publishThrottleMs = process.env.EVENT_BUFFER_PUBLISH_THROTTLE_MS
    ? Number.parseInt(process.env.EVENT_BUFFER_PUBLISH_THROTTLE_MS, 10)
    : 1000; // Publish at most once per second
  private lastPublishTime = 0;
  private pendingPublishEvent: IClickhouseEvent | null = null;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;

  private activeVisitorsExpiration = 60 * 5; // 5 minutes

  // LIST - Stores all events ready to be flushed
  private queueKey = 'event_buffer:queue';

  // STRING - Tracks total buffer size incrementally
  protected bufferCounterKey = 'event_buffer:total_count';

  // Script SHAs for loaded Lua scripts
  private scriptShas: {
    addScreenView?: string;
    addSessionEnd?: string;
  } = {};

  // Hash key for storing last screen_view per session
  private getLastScreenViewKeyBySession(sessionId: string) {
    return `event_buffer:last_screen_view:session:${sessionId}`;
  }

  // Hash key for storing last screen_view per profile
  private getLastScreenViewKeyByProfile(projectId: string, profileId: string) {
    return `event_buffer:last_screen_view:profile:${projectId}:${profileId}`;
  }

  /**
   * Lua script for handling screen_view addition - RACE-CONDITION SAFE without GroupMQ
   *
   * Strategy: Use Redis GETDEL (atomic get-and-delete) to ensure only ONE thread
   * can process the "last" screen_view at a time.
   *
   * KEYS[1] = last screen_view key (by session) - stores both event and timestamp as JSON
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

-- GETDEL is atomic: get previous and delete in one operation
-- This ensures only ONE thread gets the previous event
local previousEventData = redis.call("GETDEL", sessionKey)

-- Store new screen_view as last for session
redis.call("SET", sessionKey, newEventData, "EX", ttl)

-- Store new screen_view as last for profile (if key provided)
if profileKey and profileKey ~= "" then
  redis.call("SET", profileKey, newEventData, "EX", ttl)
end

-- If there was a previous screen_view, add it to queue with calculated duration
if previousEventData then
  local prev = cjson.decode(previousEventData)
  local curr = cjson.decode(newEventData)
  
  -- Calculate duration (ensure non-negative to handle clock skew)
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
   * Lua script for handling session_end - RACE-CONDITION SAFE
   *
   * Uses GETDEL to atomically retrieve and delete the last screen_view
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

-- GETDEL is atomic: only ONE thread gets the last screen_view
local previousEventData = redis.call("GETDEL", sessionKey)
local added = 0

-- If there was a previous screen_view, add it to queue
if previousEventData then
  local prev = cjson.decode(previousEventData)
  redis.call("RPUSH", queueKey, cjson.encode(prev.event))
  redis.call("INCR", counterKey)
  added = added + 1
end

-- Add session_end to queue
redis.call("RPUSH", queueKey, sessionEndJson)
redis.call("INCR", counterKey)
added = added + 1

-- Delete profile key
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
    // Load Lua scripts into Redis on startup
    this.loadScripts();
  }

  /**
   * Load Lua scripts into Redis and cache their SHAs.
   * This avoids sending the entire script on every call.
   */
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
    // Add all events to local buffer - they will be flushed together
    for (const event of events) {
      this.add(event);
    }
  }

  /**
   * Add an event into the local buffer for micro-batching.
   *
   * Events are buffered locally and flushed to Redis every microBatchIntervalMs
   * or when microBatchMaxSize is reached. This dramatically reduces Redis round-trips.
   *
   * Logic:
   * - screen_view: Store as "last" for session, flush previous if exists
   * - session_end: Flush last screen_view + session_end
   * - Other events: Add directly to queue
   */
  add(event: IClickhouseEvent, _multi?: ReturnType<Redis['multi']>) {
    const eventJson = JSON.stringify(event);

    // Determine event type and prepare data
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

    // If a multi was provided (legacy bulkAdd pattern), add directly without batching
    if (_multi) {
      this.addToMulti(_multi, pendingEvent);
      return;
    }

    // Add to local buffer for micro-batching
    this.pendingEvents.push(pendingEvent);

    // Check if we should flush immediately due to size
    if (this.pendingEvents.length >= this.microBatchMaxSize) {
      this.flushLocalBuffer();
      return;
    }

    // Schedule flush if not already scheduled
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flushLocalBuffer();
      }, this.microBatchIntervalMs);
    }
  }

  /**
   * Add a single pending event to a multi pipeline.
   * Used both for legacy _multi pattern and during batch flush.
   */
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
      // Regular events go directly to queue
      multi.rpush(this.queueKey, eventJson).incr(this.bufferCounterKey);
    }

    // Active visitor tracking (simplified - only ZADD, no redundant SET)
    if (event.profile_id) {
      this.incrementActiveVisitorCount(
        multi,
        event.project_id,
        event.profile_id,
      );
    }
  }

  /**
   * Force flush all pending events from local buffer to Redis immediately.
   * Useful for testing or when you need to ensure all events are persisted.
   */
  public async flush() {
    // Clear any pending timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushLocalBuffer();
  }

  /**
   * Flush all pending events from local buffer to Redis in a single pipeline.
   * This is the core optimization - batching many events into one round-trip.
   */
  private async flushLocalBuffer() {
    if (this.isFlushing || this.pendingEvents.length === 0) {
      return;
    }

    this.isFlushing = true;

    // Grab current pending events and clear buffer
    const eventsToFlush = this.pendingEvents;
    this.pendingEvents = [];

    try {
      const redis = getRedisCache();
      const multi = redis.multi();

      // Add all events to the pipeline
      for (const pending of eventsToFlush) {
        this.addToMulti(multi, pending);
      }

      await multi.exec();

      // Throttled publish - just signal that events were received
      // Store the last event for publishing (we only need one to signal activity)
      const lastEvent = eventsToFlush[eventsToFlush.length - 1];
      if (lastEvent) {
        this.scheduleThrottledPublish(lastEvent.event);
      }
    } catch (error) {
      this.logger.error('Failed to flush local buffer to Redis', {
        error,
        eventCount: eventsToFlush.length,
      });
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Throttled publish - publishes at most once per publishThrottleMs.
   * Instead of publishing every event, we just signal that events were received.
   * This reduces pub/sub load from 3000/s to 1/s.
   */
  private scheduleThrottledPublish(event: IClickhouseEvent) {
    // Always keep the latest event
    this.pendingPublishEvent = event;

    const now = Date.now();
    const timeSinceLastPublish = now - this.lastPublishTime;

    // If enough time has passed, publish immediately
    if (timeSinceLastPublish >= this.publishThrottleMs) {
      this.executeThrottledPublish();
      return;
    }

    // Otherwise, schedule a publish if not already scheduled
    if (!this.publishTimer) {
      const delay = this.publishThrottleMs - timeSinceLastPublish;
      this.publishTimer = setTimeout(() => {
        this.publishTimer = null;
        this.executeThrottledPublish();
      }, delay);
    }
  }

  /**
   * Execute the throttled publish with the latest pending event.
   */
  private executeThrottledPublish() {
    if (!this.pendingPublishEvent) {
      return;
    }

    const event = this.pendingPublishEvent;
    this.pendingPublishEvent = null;
    this.lastPublishTime = Date.now();

    // Fire-and-forget publish (no multi = returns Promise)
    const result = publishEvent('events', 'received', transformEvent(event));
    if (result instanceof Promise) {
      result.catch(() => {});
    }
  }

  /**
   * Execute a Lua script using EVALSHA (cached) or fallback to EVAL.
   * This avoids sending the entire script on every call.
   */
  private evalScript(
    multi: ReturnType<Redis['multi']>,
    scriptName: keyof typeof this.scriptShas,
    scriptContent: string,
    numKeys: number,
    ...args: (string | number)[]
  ) {
    const sha = this.scriptShas[scriptName];

    if (sha) {
      // Use EVALSHA with cached SHA
      multi.evalsha(sha, numKeys, ...args);
    } else {
      // Fallback to EVAL and try to reload script
      multi.eval(scriptContent, numKeys, ...args);
      this.logger.warn(`Script ${scriptName} not loaded, using EVAL fallback`);
      // Attempt to reload scripts in background
      this.loadScripts();
    }
  }

  /**
   * Process the Redis buffer - simplified version.
   *
   * Simply:
   * 1. Fetch events from the queue (up to batchSize)
   * 2. Parse and sort them
   * 3. Insert into ClickHouse in chunks
   * 4. Publish saved events
   * 5. Clean up processed events from queue
   */
  async processBuffer() {
    const redis = getRedisCache();

    try {
      // Fetch events from queue
      const queueEvents = await redis.lrange(
        this.queueKey,
        0,
        this.batchSize - 1,
      );

      if (queueEvents.length === 0) {
        this.logger.debug('No events to process');
        return;
      }

      // Parse events
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

      // Sort events by creation time
      eventsToClickhouse.sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime(),
      );

      // Insert events into ClickHouse in chunks
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

      // Publish "saved" events
      const pubMulti = getRedisPub().multi();
      for (const event of eventsToClickhouse) {
        await publishEvent('events', 'saved', transformEvent(event), pubMulti);
      }
      await pubMulti.exec();

      // Clean up processed events from queue
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

  /**
   * Retrieve the latest screen_view event for a given session or profile
   */
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

  /**
   * Track active visitors using ZADD only.
   *
   * Optimization: Removed redundant heartbeat SET key.
   * The ZADD score (timestamp) already tracks when a visitor was last seen.
   * We use ZRANGEBYSCORE in getActiveVisitorCount to filter active visitors.
   */
  private incrementActiveVisitorCount(
    multi: ReturnType<Redis['multi']>,
    projectId: string,
    profileId: string,
  ) {
    const now = Date.now();
    const zsetKey = `live:visitors:${projectId}`;
    // Only ZADD - the score is the timestamp, no need for separate heartbeat key
    return multi.zadd(zsetKey, now, profileId);
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
