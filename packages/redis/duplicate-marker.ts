/**
 * The ingest consumer's duplicate MARKER (M21-001).
 *
 * Carl, 2026-09-14, on the offset watermark this replaces: *"are they purely
 * for logging reprocessed? Then we should remove them, i dont care. we can use
 * the redis check we talked about earlier to mark if it was a duplicate
 * event?"*
 *
 * It is keyed on the EVENT, not on a Kafka offset. The event `id` is
 * producer-minted, so a redelivered message re-presents the same id — drill 08
 * confirmed all 161 of its duplicates were byte-identical replays sharing one
 * `id`, one `created_at` and one `session_id`. A key therefore survives
 * restarts, rebalances, evictions and process boundaries, none of which the
 * in-process watermark survived: drill 08 measured 161 real duplicates and 0
 * `REPROCESSED` lines.
 *
 * MARK MEANS COUNT AND LOG. IT DOES NOT MEAN DROP. This tells the caller the
 * id has been seen before; the caller inserts the event either way. A false
 * positive on a suppressing check is silent data loss, and whether the events
 * table ever gets dedupe is Carl's decision, not this file's.
 *
 * ONE round trip, `SET key NX PX`: the set and the "did it already exist"
 * answer are the same command, and there is no clean seam to fold it into —
 * the session buffer's own GET and Lua EVAL live in `packages/core`'s
 * `buffers/`, which this change does not own.
 *
 * IT MUST BE GIVEN THE CACHE CLIENT. That one fails fast (M18-003): offline
 * queue off once connected, `commandTimeout` 500 ms. `getRedisQueue()` keeps
 * `maxRetriesPerRequest: null` for BullMQ and would block a handler for tens
 * of seconds — which is how drill 02's consumer was evicted past its 30 s
 * session timeout, and an eviction is the only reassignment M19 measured
 * costing duplicate rows.
 *
 * Why here and not in `packages/core`'s ingest module: the whole of it is
 * Redis mechanics, and core's only export door is its barrel, which this
 * task's scope does not cover — the same reason `dead-letter.ts` lives here.
 */

/** Live key prefix. An operator has to be able to find these. */
export const DUPLICATE_MARKER_KEY_PREFIX = 'ingest:duplicate:';

/**
 * The narrow slice of a Redis client this needs. Structural rather than
 * ioredis's `Redis`, so a test can satisfy it without a server.
 */
export interface DuplicateMarkerRedisClient {
  set(
    key: string,
    value: string,
    expiryMode: 'PX',
    ttlMs: number,
    setMode: 'NX'
  ): Promise<string | null>;
}

export interface DuplicateEventMarkerOptions {
  client: DuplicateMarkerRedisClient;
  /**
   * How long a marker outlives its event. It only has to outlive the REPLAY
   * window, not the data.
   */
  ttlMs: number;
  /** Overridable for tests; production uses the constant above. */
  keyPrefix?: string;
}

/** The marker's only stored value — presence is the whole signal. */
const MARKER_VALUE = '1';

/**
 * @returns true when this event id has been seen before, false when this call
 * is the first sighting.
 *
 * REJECTS when Redis does not answer. The caller decides what that means, and
 * on the ingest path the answer is always "process the event normally" — an
 * observability counter must never be the reason an event is delayed or lost.
 */
export function createDuplicateEventMarker(
  options: DuplicateEventMarkerOptions
): (eventId: string) => Promise<boolean> {
  const keyPrefix = options.keyPrefix ?? DUPLICATE_MARKER_KEY_PREFIX;

  return async (eventId: string): Promise<boolean> => {
    const stored = await options.client.set(
      `${keyPrefix}${eventId}`,
      MARKER_VALUE,
      'PX',
      options.ttlMs,
      'NX'
    );
    // `SET NX` answers 'OK' when it wrote the key and null when one was
    // already there — so null IS the duplicate.
    return stored === null;
  };
}
