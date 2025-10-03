import { getSafeJson } from '@openpanel/json';
import {
  type Redis,
  getRedisCache,
  getRedisPub,
  publishEvent,
  runEvery,
} from '@openpanel/redis';
import { ch } from '../clickhouse/client';
import {
  type IClickhouseEvent,
  type IServiceEvent,
  transformEvent,
} from '../services/event.service';
import { BaseBuffer } from './base-buffer';

/**
 *
 * Usuful redis commands:
 * ---------------------
 *
 * Add empty session
 * ZADD event_buffer:sessions_sorted 1710831600000 "test_empty_session"
 *
 * Get session events
 * LRANGE event_buffer:session:test_empty_session 0 -1
 *
 * Get session events count
 * LLEN event_buffer:session:test_empty_session
 *
 * Get regular queue events
 * LRANGE event_buffer:regular_queue 0 -1
 *
 * Get regular queue count
 * LLEN event_buffer:regular_queue
 *
 */

export class EventBuffer extends BaseBuffer {
  // Configurable limits
  // How many days to keep buffered session metadata before cleanup
  private daysToKeep = process.env.EVENT_BUFFER_DAYS_TO_KEEP
    ? Number.parseFloat(process.env.EVENT_BUFFER_DAYS_TO_KEEP)
    : 3;
  // How many events we attempt to FETCH per flush cycle (split across sessions/non-sessions)
  // Prefer new env EVENT_BUFFER_FETCH_BATCH_SIZE; fallback to legacy EVENT_BUFFER_BATCH_SIZE
  private batchSize = process.env.EVENT_BUFFER_FETCH_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_FETCH_BATCH_SIZE, 10)
    : 4000;
  // How many events per insert chunk we send to ClickHouse (insert batch size)
  private chunkSize = process.env.EVENT_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_CHUNK_SIZE, 10)
    : 1000;
  private updatePendingSessionsBatchSize = process.env
    .EVENT_BUFFER_UPDATE_PENDING_SESSIONS_BATCH_SIZE
    ? Number.parseInt(
        process.env.EVENT_BUFFER_UPDATE_PENDING_SESSIONS_BATCH_SIZE,
        10,
      )
    : 300; // Reduced from 1000 to cap Lua payload size

  // Cap of how many ready sessions to scan per flush cycle (configurable via env)
  private maxSessionsPerFlush = process.env.EVENT_BUFFER_MAX_SESSIONS_PER_FLUSH
    ? Number.parseInt(process.env.EVENT_BUFFER_MAX_SESSIONS_PER_FLUSH, 10)
    : 500;

  // Soft time budget per flush (ms) to avoid long lock holds
  private flushTimeBudgetMs = process.env.EVENT_BUFFER_FLUSH_TIME_BUDGET_MS
    ? Number.parseInt(process.env.EVENT_BUFFER_FLUSH_TIME_BUDGET_MS, 10)
    : 1000;

  private minEventsInSession = 2;

  private activeVisitorsExpiration = 60 * 5; // 5 minutes

  private sessionEvents = ['screen_view', 'session_end'];

  // LIST - Stores events without sessions
  private regularQueueKey = 'event_buffer:regular_queue';

  // SORTED SET - Tracks all active session IDs with their timestamps
  private sessionSortedKey = 'event_buffer:sessions_sorted'; // sorted set of session IDs

  // SORTED SET - Tracks sessions that are ready for processing (have >= minEvents)
  private readySessionsKey = 'event_buffer:ready_sessions';

  // STRING - Tracks total buffer size incrementally
  protected bufferCounterKey = 'event_buffer:total_count';

  private readonly sessionKeyPrefix = 'event_buffer:session:';
  // LIST - Stores events for a given session
  private getSessionKey(sessionId: string) {
    return `${this.sessionKeyPrefix}${sessionId}`;
  }
  /**
   * Optimized Lua script that processes ready sessions efficiently.
   * Only fetches from sessions known to have >= minEvents.
   * Limits the number of events fetched per session to avoid huge payloads.
   */
  private readonly processReadySessionsScript = `
local readySessionsKey = KEYS[1]
local sessionPrefix = KEYS[2]
local maxSessions = tonumber(ARGV[1])
local maxEventsPerSession = tonumber(ARGV[2])
local startOffset = tonumber(ARGV[3]) or 0

local result = {}
local sessionsToRemove = {}

-- Get up to maxSessions ready sessions from window [startOffset, startOffset+maxSessions-1]
local stopIndex = startOffset + maxSessions - 1
local sessionIds = redis.call('ZRANGE', readySessionsKey, startOffset, stopIndex)
local resultIndex = 1

for i, sessionId in ipairs(sessionIds) do
  local sessionKey = sessionPrefix .. sessionId
  local eventCount = redis.call('LLEN', sessionKey)
  
  if eventCount == 0 then
    -- Session is empty, remove from ready set
    table.insert(sessionsToRemove, sessionId)
  else
    -- Fetch limited number of events to avoid huge payloads
    local eventsToFetch = math.min(eventCount, maxEventsPerSession)
    local events = redis.call('LRANGE', sessionKey, 0, eventsToFetch - 1)
    
    result[resultIndex] = { 
      sessionId = sessionId, 
      events = events,
      totalEventCount = eventCount
    }
    resultIndex = resultIndex + 1
  end
end

-- Clean up empty sessions from ready set
if #sessionsToRemove > 0 then
  redis.call('ZREM', readySessionsKey, unpack(sessionsToRemove))
end

return cjson.encode(result)
`;

  /**
   * Optimized atomic Lua script to update a session's list with pending events.
   * Also manages the ready_sessions set and buffer counter.
   *
   * KEYS[1] = session key
   * KEYS[2] = ready sessions key
   * KEYS[3] = buffer counter key
   * ARGV[1] = sessionId
   * ARGV[2] = snapshotCount (number of events that were present in our snapshot)
   * ARGV[3] = pendingCount (number of pending events)
   * ARGV[4] = minEventsInSession
   * ARGV[5..(4+pendingCount)] = the pending event strings
   */
  private readonly updateSessionScript = `
local sessionKey = KEYS[1]
local readySessionsKey = KEYS[2]
local bufferCounterKey = KEYS[3]
local sessionId = ARGV[1]
local snapshotCount = tonumber(ARGV[2])
local pendingCount = tonumber(ARGV[3])
local minEventsInSession = tonumber(ARGV[4])

-- Trim the list to remove the processed (snapshot) events.
redis.call("LTRIM", sessionKey, snapshotCount, -1)

-- Re-insert the pending events at the head in their original order.
for i = pendingCount, 1, -1 do
  redis.call("LPUSH", sessionKey, ARGV[i+4])
end

local newLength = redis.call("LLEN", sessionKey)

-- Update ready sessions set based on new length
if newLength >= minEventsInSession then
  redis.call("ZADD", readySessionsKey, "XX", redis.call("TIME")[1], sessionId)
else
  redis.call("ZREM", readySessionsKey, sessionId)
end

-- Update buffer counter (decrement by processed events, increment by pending)
local counterChange = pendingCount - snapshotCount
if counterChange ~= 0 then
  redis.call("INCRBY", bufferCounterKey, counterChange)
end

return newLength
`;

  /**
   * Optimized batch update script with counter and ready sessions management.
   * KEYS[1] = ready sessions key
   * KEYS[2] = buffer counter key
   * ARGV format: [sessionKey1, sessionId1, snapshotCount1, pendingCount1, pending1...., sessionKey2, ...]
   */
  private readonly batchUpdateSessionsScript = `
local readySessionsKey = KEYS[1]
local bufferCounterKey = KEYS[2]
local minEventsInSession = tonumber(ARGV[1])
local totalCounterChange = 0

local i = 2
while i <= #ARGV do
  local sessionKey = ARGV[i]
  local sessionId = ARGV[i + 1]
  local snapshotCount = tonumber(ARGV[i + 2])
  local pendingCount = tonumber(ARGV[i + 3])
  
  -- Trim the list to remove processed events
  redis.call("LTRIM", sessionKey, snapshotCount, -1)
  
  -- Re-insert pending events at the head in original order
  if pendingCount > 0 then
    local pendingEvents = {}
    for j = 1, pendingCount do
      table.insert(pendingEvents, ARGV[i + 3 + j])
    end
    redis.call("LPUSH", sessionKey, unpack(pendingEvents))
  end
  
  local newLength = redis.call("LLEN", sessionKey)
  
  -- Update ready sessions set based on new length
  if newLength >= minEventsInSession then
    redis.call("ZADD", readySessionsKey, "XX", redis.call("TIME")[1], sessionId)
  else
    redis.call("ZREM", readySessionsKey, sessionId)
  end
  
  -- Track counter change
  totalCounterChange = totalCounterChange + (pendingCount - snapshotCount)
  
  i = i + 4 + pendingCount
end

-- Update buffer counter once
if totalCounterChange ~= 0 then
  redis.call("INCRBY", bufferCounterKey, totalCounterChange)
end

return "OK"
`;

  constructor() {
    super({
      name: 'event',
      onFlush: async () => {
        await this.processBuffer();
        await this.tryCleanup();
      },
    });
  }

  bulkAdd(events: IClickhouseEvent[]) {
    const redis = getRedisCache();
    const multi = redis.multi();
    for (const event of events) {
      this.add(event, multi);
    }
    return multi.exec();
  }

  /**
   * Optimized Lua script for adding events with counter management.
   * KEYS[1] = session key (if session event)
   * KEYS[2] = regular queue key
   * KEYS[3] = sessions sorted key
   * KEYS[4] = ready sessions key
   * KEYS[5] = buffer counter key
   * KEYS[6] = last event key (if screen_view)
   * ARGV[1] = event JSON
   * ARGV[2] = session_id
   * ARGV[3] = event_name
   * ARGV[4] = score (timestamp)
   * ARGV[5] = minEventsInSession
   * ARGV[6] = last event TTL (if screen_view)
   */
  private readonly addEventScript = `
local sessionKey = KEYS[1]
local regularQueueKey = KEYS[2]
local sessionsSortedKey = KEYS[3]
local readySessionsKey = KEYS[4]
local bufferCounterKey = KEYS[5]
local lastEventKey = KEYS[6]

local eventJson = ARGV[1]
local sessionId = ARGV[2]
local eventName = ARGV[3]
local score = tonumber(ARGV[4])
local minEventsInSession = tonumber(ARGV[5])
local lastEventTTL = tonumber(ARGV[6] or 0)

local counterIncrement = 1

if sessionId and sessionId ~= "" and (eventName == "screen_view" or eventName == "session_end") then
  -- Add to session
  redis.call("RPUSH", sessionKey, eventJson)
  redis.call("ZADD", sessionsSortedKey, "NX", score, sessionId)
  
  -- Check if session is now ready for processing
  local sessionLength = redis.call("LLEN", sessionKey)
  if sessionLength >= minEventsInSession or eventName == "session_end" then
    redis.call("ZADD", readySessionsKey, score, sessionId)
  end
  
  -- Handle screen_view specific logic
  if eventName == "screen_view" and lastEventKey ~= "" then
    redis.call("SET", lastEventKey, eventJson, "EX", lastEventTTL)
  elseif eventName == "session_end" and lastEventKey ~= "" then
    redis.call("DEL", lastEventKey)
  end
else
  -- Add to regular queue
  redis.call("RPUSH", regularQueueKey, eventJson)
end

-- Increment buffer counter
redis.call("INCR", bufferCounterKey)

return "OK"
`;

  /**
   * Add an event into Redis.
   * Uses optimized Lua script to reduce round trips and manage counters.
   */
  async add(event: IClickhouseEvent, _multi?: ReturnType<Redis['multi']>) {
    try {
      const redis = getRedisCache();
      const eventJson = JSON.stringify(event);
      const multi = _multi || redis.multi();

      const isSessionEvent =
        event.session_id && this.sessionEvents.includes(event.name);

      if (isSessionEvent) {
        const sessionKey = this.getSessionKey(event.session_id);
        const score = new Date(event.created_at || Date.now()).getTime();
        const lastEventKey =
          event.name === 'screen_view'
            ? this.getLastEventKey({
                projectId: event.project_id,
                profileId: event.profile_id,
              })
            : event.name === 'session_end'
              ? this.getLastEventKey({
                  projectId: event.project_id,
                  profileId: event.profile_id,
                })
              : '';

        multi.eval(
          this.addEventScript,
          6,
          sessionKey,
          this.regularQueueKey,
          this.sessionSortedKey,
          this.readySessionsKey,
          this.bufferCounterKey,
          lastEventKey,
          eventJson,
          event.session_id,
          event.name,
          score.toString(),
          this.minEventsInSession.toString(),
          '3600', // 1 hour TTL for last event
        );
      } else {
        // Non-session events go to regular queue
        multi
          .rpush(this.regularQueueKey, eventJson)
          .incr(this.bufferCounterKey);
      }

      if (event.profile_id) {
        this.incrementActiveVisitorCount(
          multi,
          event.project_id,
          event.profile_id,
        );
      }

      if (!_multi) {
        await multi.exec();
      }

      // Publish compact event notification instead of full payload
      // Use transformEvent but only publish essential fields to reduce overhead
      const serviceEvent = transformEvent(event);
      await publishEvent('events', 'received', {
        ...serviceEvent,
        // Clear heavy fields to reduce payload size
        properties: { __compact: true },
        profile: undefined,
        meta: undefined,
      });
    } catch (error) {
      this.logger.error('Failed to add event to Redis buffer', { error });
    }
  }

  private async getEligibleSessions(
    startOffset: number,
    maxEventsPerSession: number,
    sessionsPerPage: number,
  ) {
    const sessionsSorted = await getRedisCache().eval(
      this.processReadySessionsScript,
      2, // number of KEYS
      this.readySessionsKey,
      this.sessionKeyPrefix,
      sessionsPerPage.toString(),
      maxEventsPerSession.toString(),
      startOffset.toString(),
    );

    const parsed = getSafeJson<
      Array<{
        sessionId: string;
        events: string[];
        totalEventCount: number;
      }>
    >(sessionsSorted as string);

    const sessions: Record<
      string,
      {
        events: IClickhouseEvent[];
        totalEventCount: number;
      }
    > = {};

    if (!parsed || !Array.isArray(parsed)) {
      return sessions;
    }

    for (const session of parsed) {
      const events = session.events
        .map((e) => getSafeJson<IClickhouseEvent>(e))
        .filter((e): e is IClickhouseEvent => e !== null);

      sessions[session.sessionId] = {
        events,
        totalEventCount: session.totalEventCount,
      };
    }

    return sessions;
  }

  /**
   * Process the Redis buffer.
   *
   * 1. Fetch events from two sources in parallel:
   *    - Pick events from regular queue (batchSize / 2)
   *    - Pick events from sessions (batchSize / 2).
   *      This only have screen_view and session_end events
   *
   * 2. Process session events:
   *    - For screen_view events, calculate duration if next event exists
   *    - Last screen_view of each session remains pending
   *    - All other events are marked for flushing
   *
   * 3. Process regular queue events:
   *    - Inherit path/origin from last screen_view of same session if exists
   *
   * 4. Insert all flushable events into ClickHouse in chunks and publish notifications
   *
   * 5. Clean up processed events:
   *    - For regular queue: LTRIM processed events
   *    - For sessions: Update lists atomically via Lua script, preserving pending events
   */
  async processBuffer() {
    const redis = getRedisCache();
    const eventsToClickhouse: IClickhouseEvent[] = [];
    const pendingUpdates: Array<{
      sessionId: string;
      snapshotCount: number;
      pending: IClickhouseEvent[];
    }> = [];
    const timer = {
      fetchUnprocessedEvents: 0,
      processSessionEvents: 0,
      processRegularQueueEvents: 0,
      insertEvents: 0,
      updatePendingSessions: 0,
    };

    try {
      let now = performance.now();
      // (A) Fetch no-session events once per run
      const regularQueueEvents = await redis.lrange(
        this.regularQueueKey,
        0,
        this.batchSize / 2 - 1,
      );

      // (A2) Page through ready sessions within time and budget
      let sessionBudget = Math.floor(this.batchSize / 2);
      let startOffset = 0;
      let totalSessionEventsFetched = 0;
      while (sessionBudget > 0) {
        if (performance.now() - now > this.flushTimeBudgetMs) {
          this.logger.debug('Stopping session paging due to time budget');
          break;
        }

        const sessionsPerPage = Math.min(
          this.maxSessionsPerFlush,
          Math.max(1, Math.floor(sessionBudget / 2)),
        );
        const perSessionBudget = Math.max(
          2,
          Math.floor(sessionBudget / sessionsPerPage),
        );

        const sessionsPage = await this.getEligibleSessions(
          startOffset,
          perSessionBudget,
          sessionsPerPage,
        );
        const sessionIds = Object.keys(sessionsPage);
        if (sessionIds.length === 0) {
          break;
        }

        for (const sessionId of sessionIds) {
          const sessionData = sessionsPage[sessionId]!;
          const { flush, pending } = this.processSessionEvents(
            sessionData.events,
          );

          if (flush.length > 0) {
            eventsToClickhouse.push(...flush);
          }

          pendingUpdates.push({
            sessionId,
            snapshotCount: sessionData.events.length,
            pending,
          });

          // Decrease budget by fetched events for this session window
          sessionBudget -= sessionData.events.length;
          totalSessionEventsFetched += sessionData.events.length;
          if (sessionBudget <= 0) {
            break;
          }
        }
        startOffset += sessionsPerPage;
      }

      timer.processSessionEvents = performance.now() - now;
      now = performance.now();

      // (B) Process no-session events
      for (const eventStr of regularQueueEvents) {
        const event = getSafeJson<IClickhouseEvent>(eventStr);
        if (event) {
          eventsToClickhouse.push(event);
        }
      }

      timer.processRegularQueueEvents = performance.now() - now;
      now = performance.now();

      if (eventsToClickhouse.length === 0) {
        this.logger.debug('No events to process');
        return;
      }

      // (C) Sort events by creation time.
      eventsToClickhouse.sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime(),
      );

      // (D) Insert events into ClickHouse in chunks
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

      timer.insertEvents = performance.now() - now;
      now = performance.now();

      // (E) Publish "saved" events.
      const pubMulti = getRedisPub().multi();
      for (const event of eventsToClickhouse) {
        await publishEvent('events', 'saved', transformEvent(event), pubMulti);
      }
      await pubMulti.exec();

      // (F) Only after successful processing, update Redis
      const multi = redis.multi();

      // Clean up no-session events and update counter
      if (regularQueueEvents.length > 0) {
        multi
          .ltrim(this.regularQueueKey, regularQueueEvents.length, -1)
          .decrby(this.bufferCounterKey, regularQueueEvents.length);
      }

      await multi.exec();

      // Process pending sessions in batches
      await this.processPendingSessionsInBatches(redis, pendingUpdates);

      timer.updatePendingSessions = performance.now() - now;

      this.logger.info('Processed events from Redis buffer', {
        batchSize: this.batchSize,
        eventsToClickhouse: eventsToClickhouse.length,
        pendingSessionUpdates: pendingUpdates.length,
        sessionEventsFetched: totalSessionEventsFetched,
        regularEvents: regularQueueEvents.length,
        timer,
      });
    } catch (error) {
      this.logger.error('Error processing Redis buffer', { error });
    }
  }

  /**
   * Process a session's events.
   *
   * For each event in the session (in order):
   * - If it is a screen_view, look for a subsequent event (screen_view or session_end)
   *   to calculate its duration. If found, flush it; if not, leave it pending.
   *
   * Returns an object with two arrays:
   *   flush: events to be sent to ClickHouse.
   *   pending: events that remain in the Redis session list.
   */
  private processSessionEvents(events: IClickhouseEvent[]): {
    flush: IClickhouseEvent[];
    pending: IClickhouseEvent[];
  } {
    // Ensure events are sorted by created_at
    events.sort(
      (a, b) =>
        new Date(a.created_at || 0).getTime() -
        new Date(b.created_at || 0).getTime(),
    );

    const flush: IClickhouseEvent[] = [];
    const pending: IClickhouseEvent[] = [];
    let hasSessionEnd = false;

    for (let i = 0; i < events.length; i++) {
      const event = events[i]!;

      if (event.name === 'session_end') {
        hasSessionEnd = true;
        flush.push(event);
      } else {
        // For screen_view events, look for next event
        const next = events[i + 1];
        if (next) {
          if (next.name === 'screen_view') {
            event.duration =
              new Date(next.created_at).getTime() -
              new Date(event.created_at).getTime();
          }
          flush.push(event);
        } else if (hasSessionEnd) {
          flush.push(event);
        } else {
          pending.push(event);
        }
      }
    }

    return { flush, pending };
  }

  async tryCleanup() {
    try {
      await runEvery({
        interval: 60 * 60 * 24,
        fn: this.cleanup.bind(this),
        key: `${this.name}-cleanup`,
      });
    } catch (error) {
      this.logger.error('Failed to run cleanup', { error });
    }
  }

  /**
   * Cleanup old events from Redis.
   * For each key (no-session and per-session), remove events older than the cutoff date.
   */
  async cleanup() {
    const redis = getRedisCache();
    const cutoffTime = Date.now() - 1000 * 60 * 60 * 24 * this.daysToKeep;

    try {
      const sessionIds = await redis.zrange(this.sessionSortedKey, 0, -1);

      for (const sessionId of sessionIds) {
        const score = await redis.zscore(this.sessionSortedKey, sessionId);

        if (score) {
          const scoreInt = Number.parseInt(score, 10);
          if (scoreInt < cutoffTime) {
            this.logger.warn('Stale session found', {
              sessionId,
              score,
              createdAt: new Date(Number.parseInt(score, 10)),
              eventsCount: await redis.llen(this.getSessionKey(sessionId)),
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup stale sessions', { error });
    }
  }

  /**
   * Retrieve the latest screen_view event for a given project/profile or project/session
   */
  public async getLastScreenView({
    projectId,
    ...rest
  }:
    | {
        projectId: string;
        profileId: string;
      }
    | {
        projectId: string;
        sessionId: string;
      }): Promise<IServiceEvent | null> {
    if ('profileId' in rest) {
      const redis = getRedisCache();
      const eventStr = await redis.get(
        this.getLastEventKey({ projectId, profileId: rest.profileId }),
      );
      if (eventStr) {
        const parsed = getSafeJson<IClickhouseEvent>(eventStr);
        if (parsed) {
          return transformEvent(parsed);
        }
      }
    }

    if ('sessionId' in rest) {
      const redis = getRedisCache();
      const sessionKey = this.getSessionKey(rest.sessionId);
      const lastEvent = await redis.lindex(sessionKey, -1);
      if (lastEvent) {
        const parsed = getSafeJson<IClickhouseEvent>(lastEvent);
        if (parsed) {
          return transformEvent(parsed);
        }
      }
    }

    return null;
  }

  private getLastEventKey({
    projectId,
    profileId,
  }: {
    projectId: string;
    profileId: string;
  }) {
    return `session:last_screen_view:${projectId}:${profileId}`;
  }

  private async processPendingSessionsInBatches(
    redis: ReturnType<typeof getRedisCache>,
    pendingUpdates: Array<{
      sessionId: string;
      snapshotCount: number;
      pending: IClickhouseEvent[];
    }>,
  ) {
    for (const batch of this.chunks(
      pendingUpdates,
      this.updatePendingSessionsBatchSize,
    )) {
      const batchArgs: string[] = [this.minEventsInSession.toString()];

      for (const { sessionId, snapshotCount, pending } of batch) {
        const sessionKey = this.getSessionKey(sessionId);
        batchArgs.push(
          sessionKey,
          sessionId,
          snapshotCount.toString(),
          pending.length.toString(),
          ...pending.map((e) => JSON.stringify(e)),
        );
      }

      await redis.eval(
        this.batchUpdateSessionsScript,
        2, // KEYS: ready sessions, buffer counter
        this.readySessionsKey,
        this.bufferCounterKey,
        ...batchArgs,
      );
    }
  }

  public async getBufferSizeHeavy() {
    // Fallback method for when counter is not available
    const redis = getRedisCache();
    const pipeline = redis.pipeline();

    // Queue up commands in the pipeline
    pipeline.llen(this.regularQueueKey);
    pipeline.zcard(this.sessionSortedKey);

    // Execute pipeline to get initial counts
    const [regularQueueCount, sessionCount] = (await pipeline.exec()) as [
      any,
      any,
    ];

    if (sessionCount[1] === 0) {
      return regularQueueCount[1];
    }

    // Get all session IDs and queue up LLEN commands for each session
    const sessionIds = await redis.zrange(this.sessionSortedKey, 0, -1);
    const sessionPipeline = redis.pipeline();

    for (const sessionId of sessionIds) {
      sessionPipeline.llen(this.getSessionKey(sessionId));
    }

    // Execute all LLEN commands in a single pipeline
    const sessionCounts = (await sessionPipeline.exec()) as [any, any][];

    // Sum up all counts
    const totalSessionEvents = sessionCounts.reduce((sum, [err, count]) => {
      if (err) return sum;
      return sum + count;
    }, 0);

    return regularQueueCount[1] + totalSessionEvents;
  }

  public async getBufferSize() {
    return this.getBufferSizeWithCounter(() => this.getBufferSizeHeavy());
  }

  private async incrementActiveVisitorCount(
    multi: ReturnType<Redis['multi']>,
    projectId: string,
    profileId: string,
  ) {
    // Use zset only, no ephemeral keys - much more efficient
    const now = Date.now();
    const zsetKey = `live:visitors:${projectId}`;
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
