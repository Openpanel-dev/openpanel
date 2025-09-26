import { getSafeJson, setSuperJson } from '@openpanel/json';
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
  private daysToKeep = process.env.EVENT_BUFFER_DAYS_TO_KEEP
    ? Number.parseFloat(process.env.EVENT_BUFFER_DAYS_TO_KEEP)
    : 3;
  private batchSize = process.env.EVENT_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_BATCH_SIZE, 10)
    : 4000;
  private chunkSize = process.env.EVENT_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_CHUNK_SIZE, 10)
    : 1000;
  private updatePendingSessionsBatchSize = process.env
    .EVENT_BUFFER_UPDATE_PENDING_SESSIONS_BATCH_SIZE
    ? Number.parseInt(
        process.env.EVENT_BUFFER_UPDATE_PENDING_SESSIONS_BATCH_SIZE,
        10,
      )
    : 1000;

  private activeVisitorsExpiration = 60 * 5; // 5 minutes

  private sessionEvents = ['screen_view', 'session_end'];

  // LIST - Stores events without sessions
  private regularQueueKey = 'event_buffer:regular_queue';

  // SORTED SET - Tracks all active session IDs with their timestamps
  private sessionSortedKey = 'event_buffer:sessions_sorted'; // sorted set of session IDs

  private readonly sessionKeyPrefix = 'event_buffer:session:';
  // LIST - Stores events for a given session
  private getSessionKey(sessionId: string) {
    return `${this.sessionKeyPrefix}${sessionId}`;
  }
  /**
   * Lua script that loops through sessions and returns a JSON-encoded list of
   * session objects (sessionId and events). It stops once a total number of events
   * >= batchSize is reached. It also cleans up any empty sessions.
   */
  private readonly processSessionsScript = `
local sessionSortedKey = KEYS[1]
local sessionPrefix = KEYS[2]
local batchSize = tonumber(ARGV[1])
local minEvents = tonumber(ARGV[2])

local result = {}
local sessionsToRemove = {}
local sessionIds = redis.call('ZRANGE', sessionSortedKey, 0, -1)
local resultIndex = 1
local totalEvents = 0

for i, sessionId in ipairs(sessionIds) do
  local sessionKey = sessionPrefix .. sessionId
  local events = redis.call('LRANGE', sessionKey, 0, -1)
  
  if #events == 0 then
    table.insert(sessionsToRemove, sessionId)
    -- If we have collected 100 sessions to remove, remove them now
    if #sessionsToRemove >= 100 then
      redis.call('ZREM', sessionSortedKey, unpack(sessionsToRemove))
      sessionsToRemove = {}
    end
  elseif #events >= minEvents then
    result[resultIndex] = { sessionId = sessionId, events = events }
    resultIndex = resultIndex + 1
    totalEvents = totalEvents + #events
  end
  
  -- Only check if we should break AFTER processing the entire session
  if totalEvents >= batchSize then
    break
  end
end

-- Remove any remaining sessions
if #sessionsToRemove > 0 then
  redis.call('ZREM', sessionSortedKey, unpack(sessionsToRemove))
end

return cjson.encode(result)
`;

  /**
   * New atomic Lua script to update a session's list with pending events.
   * Instead of doing a separate DEL and RPUSH (which leaves a race condition),
   * this script will:
   * 1. Remove the first `snapshotCount` items from the session list.
   * 2. Re-insert the pending events (provided as additional arguments)
   *    at the head (using LPUSH in reverse order to preserve order).
   *
   * KEYS[1] = session key
   * ARGV[1] = snapshotCount (number of events that were present in our snapshot)
   * ARGV[2] = pendingCount (number of pending events)
   * ARGV[3..(2+pendingCount)] = the pending event strings
   */
  private readonly updateSessionScript = `
local snapshotCount = tonumber(ARGV[1])
local pendingCount = tonumber(ARGV[2])
local sessionKey = KEYS[1]

-- Trim the list to remove the processed (snapshot) events.
redis.call("LTRIM", sessionKey, snapshotCount, -1)

-- Re-insert the pending events at the head in their original order.
for i = pendingCount, 1, -1 do
  redis.call("LPUSH", sessionKey, ARGV[i+2])
end

return redis.call("LLEN", sessionKey)
`;

  /**
   * Lua script that processes a batch of session updates in a single call.
   * Format of updates: [sessionKey1, snapshotCount1, pendingCount1, pending1...., sessionKey2, ...]
   */
  private readonly batchUpdateSessionsScript = `
local i = 1
while i <= #ARGV do
  local sessionKey = ARGV[i]
  local snapshotCount = tonumber(ARGV[i + 1])
  local pendingCount = tonumber(ARGV[i + 2])
  
  -- Trim the list to remove processed events
  redis.call("LTRIM", sessionKey, snapshotCount, -1)
  
  -- Re-insert pending events at the head in original order
  if pendingCount > 0 then
    local pendingEvents = {}
    for j = 1, pendingCount do
      table.insert(pendingEvents, ARGV[i + 2 + j])
    end
    redis.call("LPUSH", sessionKey, unpack(pendingEvents))
  end
  
  i = i + 3 + pendingCount
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
   * Add an event into Redis.
   * Combines multiple Redis operations into a single MULTI command.
   */
  async add(event: IClickhouseEvent, _multi?: ReturnType<Redis['multi']>) {
    try {
      const redis = getRedisCache();
      const eventJson = JSON.stringify(event);
      const multi = _multi || redis.multi();

      if (event.session_id && this.sessionEvents.includes(event.name)) {
        const sessionKey = this.getSessionKey(event.session_id);
        const addEventToSession = () => {
          const score = new Date(event.created_at || Date.now()).getTime();
          multi
            .rpush(sessionKey, eventJson)
            .zadd(this.sessionSortedKey, 'NX', score, event.session_id);
        };

        if (event.name === 'screen_view') {
          multi.set(
            this.getLastEventKey({
              projectId: event.project_id,
              profileId: event.profile_id,
            }),
            eventJson,
            'EX',
            60 * 60,
          );

          addEventToSession();
        } else if (event.name === 'session_end') {
          // Delete last screen view
          multi.del(
            this.getLastEventKey({
              projectId: event.project_id,
              profileId: event.profile_id,
            }),
          );

          // Check if session has any events
          const eventCount = await redis.llen(sessionKey);

          if (eventCount === 0) {
            // If session is empty, add to regular queue and don't track in sorted set
            multi.rpush(this.regularQueueKey, eventJson);
          } else {
            // Otherwise add to session as normal
            addEventToSession();
          }
        }
      } else {
        // All other events go to regularQueue queue
        multi.rpush(this.regularQueueKey, eventJson);
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
      await publishEvent('events', 'received', transformEvent(event));
    } catch (error) {
      this.logger.error('Failed to add event to Redis buffer', { error });
    }
  }

  private async getEligableSessions({ minEventsInSession = 2 }) {
    const sessionsSorted = await getRedisCache().eval(
      this.processSessionsScript,
      2, // number of KEYS
      this.sessionSortedKey,
      this.sessionKeyPrefix,
      (this.batchSize / 2).toString(),
      minEventsInSession.toString(),
    );

    // (A) Process session events using the Lua script.
    const parsed = getSafeJson<
      Array<{
        sessionId: string;
        events: string[];
      }>
    >(sessionsSorted as string);

    const sessions: Record<string, IClickhouseEvent[]> = {};
    if (!parsed) {
      return sessions;
    }

    if (!Array.isArray(parsed)) {
      return sessions;
    }

    for (const session of parsed) {
      sessions[session.sessionId] = session.events
        .map((e) => getSafeJson<IClickhouseEvent>(e))
        .filter((e): e is IClickhouseEvent => e !== null);
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
      const [sessions, regularQueueEvents] = await Promise.all([
        // (A) Fetch session events
        this.getEligableSessions({ minEventsInSession: 2 }),
        // (B) Fetch no-session events
        redis.lrange(this.regularQueueKey, 0, this.batchSize / 2 - 1),
      ]);

      timer.fetchUnprocessedEvents = performance.now() - now;
      now = performance.now();

      for (const [sessionId, sessionEvents] of Object.entries(sessions)) {
        const { flush, pending } = this.processSessionEvents(sessionEvents);

        if (flush.length > 0) {
          eventsToClickhouse.push(...flush);
        }

        pendingUpdates.push({
          sessionId,
          snapshotCount: sessionEvents.length,
          pending,
        });
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

      // Clean up no-session events
      if (regularQueueEvents.length > 0) {
        multi.ltrim(this.regularQueueKey, regularQueueEvents.length, -1);
      }

      await multi.exec();

      // Process pending sessions in batches
      await this.processPendingSessionsInBatches(redis, pendingUpdates);

      timer.updatePendingSessions = performance.now() - now;

      this.logger.info('Processed events from Redis buffer', {
        batchSize: this.batchSize,
        eventsToClickhouse: eventsToClickhouse.length,
        pendingSessionUpdates: pendingUpdates.length,
        sessionEvents: Object.entries(sessions).reduce(
          (acc, [sId, events]) => acc + events.length,
          0,
        ),
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
      const batchArgs: string[] = [];

      for (const { sessionId, snapshotCount, pending } of batch) {
        const sessionKey = this.getSessionKey(sessionId);
        batchArgs.push(
          sessionKey,
          snapshotCount.toString(),
          pending.length.toString(),
          ...pending.map((e) => JSON.stringify(e)),
        );
      }

      await redis.eval(
        this.batchUpdateSessionsScript,
        0, // no KEYS needed
        ...batchArgs,
      );
    }
  }

  public async getBufferSizeHeavy() {
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
    const cached = await getRedisCache().get('event_buffer:cached_count');
    if (cached) {
      return Number.parseInt(cached, 10);
    }
    const count = await this.getBufferSizeHeavy();
    await getRedisCache().set(
      'event_buffer:cached_count',
      count.toString(),
      'EX',
      15, // increase when we know it's stable
    );
    return count;
  }

  private async incrementActiveVisitorCount(
    multi: ReturnType<Redis['multi']>,
    projectId: string,
    profileId: string,
  ) {
    // Add/update visitor with current timestamp as score
    const now = Date.now();
    const zsetKey = `live:visitors:${projectId}`;
    return (
      multi
        // To keep the count
        .zadd(zsetKey, now, profileId)
        // To trigger the expiration listener
        .set(
          `live:visitor:${projectId}:${profileId}`,
          '1',
          'EX',
          this.activeVisitorsExpiration,
        )
    );
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
