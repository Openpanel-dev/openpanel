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
 */

export class EventBuffer extends BaseBuffer {
  // Configurable limits
  private batchSize = process.env.EVENT_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_BATCH_SIZE, 10)
    : 4000;
  private chunkSize = process.env.EVENT_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_CHUNK_SIZE, 10)
    : 1000;

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
   * Lua script for handling screen_view addition:
   * - Get previous screen_view from Redis (by session)
   * - If exists, calculate duration and add to queue
   * - Store new screen_view as "last" for both session and profile keys
   *
   * KEYS[1] = last screen_view key (by session)
   * KEYS[2] = last screen_view timestamp key (by session)
   * KEYS[3] = last screen_view key (by profile, may be empty)
   * KEYS[4] = last screen_view timestamp key (by profile, may be empty)
   * KEYS[5] = queue key
   * KEYS[6] = buffer counter key
   * ARGV[1] = new event JSON
   * ARGV[2] = new event timestamp (epoch ms)
   * ARGV[3] = TTL for last screen_view (1 hour)
   */
  private readonly addScreenViewScript = `
local sessionKey = KEYS[1]
local sessionTsKey = KEYS[2]
local profileKey = KEYS[3]
local profileTsKey = KEYS[4]
local queueKey = KEYS[5]
local counterKey = KEYS[6]
local newEventJson = ARGV[1]
local newTimestamp = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

-- Get previous event and its timestamp from session key
local previousEventJson = redis.call("GET", sessionKey)
local previousTimestamp = redis.call("GET", sessionTsKey)

-- Store new screen_view as last for session
redis.call("SET", sessionKey, newEventJson, "EX", ttl)
redis.call("SET", sessionTsKey, newTimestamp, "EX", ttl)

-- Store new screen_view as last for profile (if key provided)
if profileKey and profileKey ~= "" then
  redis.call("SET", profileKey, newEventJson, "EX", ttl)
  redis.call("SET", profileTsKey, newTimestamp, "EX", ttl)
end

-- If there was a previous screen_view, add it to queue with calculated duration
if previousEventJson and previousTimestamp then
  local previousEvent = cjson.decode(previousEventJson)
  local prevTs = tonumber(previousTimestamp)
  if prevTs then
    previousEvent.duration = newTimestamp - prevTs
  end
  redis.call("RPUSH", queueKey, cjson.encode(previousEvent))
  redis.call("INCR", counterKey)
  return 1
end

return 0
`;

  /**
   * Lua script for handling session_end:
   * - Get the last screen_view (by session)
   * - Add screen_view to queue (if exists)
   * - Add session_end to queue
   * - Delete last screen_view keys (both session and profile)
   *
   * KEYS[1] = last screen_view key (by session)
   * KEYS[2] = last screen_view timestamp key (by session)
   * KEYS[3] = last screen_view key (by profile, may be empty)
   * KEYS[4] = last screen_view timestamp key (by profile, may be empty)
   * KEYS[5] = queue key
   * KEYS[6] = buffer counter key
   * ARGV[1] = session_end event JSON
   */
  private readonly addSessionEndScript = `
local sessionKey = KEYS[1]
local sessionTsKey = KEYS[2]
local profileKey = KEYS[3]
local profileTsKey = KEYS[4]
local queueKey = KEYS[5]
local counterKey = KEYS[6]
local sessionEndJson = ARGV[1]

-- Get previous event from session key
local previousEventJson = redis.call("GET", sessionKey)
local added = 0

-- If there was a previous screen_view, add it to queue
if previousEventJson then
  redis.call("RPUSH", queueKey, previousEventJson)
  redis.call("INCR", counterKey)
  added = added + 1
end

-- Add session_end to queue
redis.call("RPUSH", queueKey, sessionEndJson)
redis.call("INCR", counterKey)
added = added + 1

-- Delete last screen_view from both keys (event and timestamp)
redis.call("DEL", sessionKey, sessionTsKey)
if profileKey and profileKey ~= "" then
  redis.call("DEL", profileKey, profileTsKey)
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
    const redis = getRedisCache();
    const multi = redis.multi();
    for (const event of events) {
      this.add(event, multi);
    }
    return multi.exec();
  }

  /**
   * Add an event into Redis buffer.
   *
   * Logic:
   * - screen_view: Store as "last" for session, flush previous if exists
   * - session_end: Flush last screen_view + session_end
   * - Other events: Add directly to queue
   */
  async add(event: IClickhouseEvent, _multi?: ReturnType<Redis['multi']>) {
    try {
      const redis = getRedisCache();
      const eventJson = JSON.stringify(event);
      const multi = _multi || redis.multi();

      if (event.session_id && event.name === 'screen_view') {
        // Handle screen_view
        const sessionKey = this.getLastScreenViewKeyBySession(event.session_id);
        const sessionTsKey = `${sessionKey}:ts`;
        const profileKey = event.profile_id
          ? this.getLastScreenViewKeyByProfile(
              event.project_id,
              event.profile_id,
            )
          : '';
        const profileTsKey = profileKey ? `${profileKey}:ts` : '';
        const timestamp = new Date(event.created_at || Date.now()).getTime();

        this.evalScript(
          multi,
          'addScreenView',
          this.addScreenViewScript,
          6,
          sessionKey,
          sessionTsKey,
          profileKey,
          profileTsKey,
          this.queueKey,
          this.bufferCounterKey,
          eventJson,
          timestamp.toString(),
          '3600', // 1 hour TTL
        );
      } else if (event.session_id && event.name === 'session_end') {
        // Handle session_end
        const sessionKey = this.getLastScreenViewKeyBySession(event.session_id);
        const sessionTsKey = `${sessionKey}:ts`;
        const profileKey = event.profile_id
          ? this.getLastScreenViewKeyByProfile(
              event.project_id,
              event.profile_id,
            )
          : '';
        const profileTsKey = profileKey ? `${profileKey}:ts` : '';

        this.evalScript(
          multi,
          'addSessionEnd',
          this.addSessionEndScript,
          6,
          sessionKey,
          sessionTsKey,
          profileKey,
          profileTsKey,
          this.queueKey,
          this.bufferCounterKey,
          eventJson,
        );
      } else {
        // All other events go directly to queue
        multi.rpush(this.queueKey, eventJson).incr(this.bufferCounterKey);
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

    const eventStr = await redis.get(lastScreenViewKey);

    if (eventStr) {
      const parsed = getSafeJson<IClickhouseEvent>(eventStr);
      if (parsed) {
        return transformEvent(parsed);
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

  private async incrementActiveVisitorCount(
    multi: ReturnType<Redis['multi']>,
    projectId: string,
    profileId: string,
  ) {
    // Track active visitors and emit expiry events when inactive for TTL
    const now = Date.now();
    const zsetKey = `live:visitors:${projectId}`;
    const heartbeatKey = `live:visitor:${projectId}:${profileId}`;
    return multi
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
