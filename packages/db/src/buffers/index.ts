import { BotBuffer as BotBufferRedis } from './bot-buffer';
import {
  EVENT_BUFFER_SHARDS,
  EventBuffer as EventBufferRedis,
  hashEventToShard,
} from './event-buffer';
import { GroupBuffer } from './group-buffer';
import { ProfileBackfillBuffer } from './profile-backfill-buffer';
import { ProfileBuffer as ProfileBufferRedis } from './profile-buffer';
import { ReplayBuffer } from './replay-buffer';
import { SessionBuffer } from './session-buffer';
import type { IClickhouseEvent } from '../services/event.service';

// ----------------------------------------------------------------------------
// Sharded event buffer
//
// We always keep the legacy buffer (key: `event_buffer:queue`) so that any
// events queued by an older code version pre-deploy continue draining; new
// events route to N shards (keys: `event_buffer:queue:0` ...
// `event_buffer:queue:N-1`) by a stable hash of device_id. The cron-driven
// flush triggers all N+1 buffers in parallel; each takes its own Redis lock
// (`lock:event` for the legacy buffer, `lock:event:i` for shard i) so they
// don't serialize on a single global flush lock.
//
// Default EVENT_BUFFER_SHARDS=1 keeps behavior bit-identical to the prior
// single-key code path: only the legacy buffer is created and used. Set
// EVENT_BUFFER_SHARDS=8 (or 16) to enable parallel drain.
// ----------------------------------------------------------------------------

/** Always-on legacy buffer (single-key, backward-compatible). */
const legacyEventBuffer = new EventBufferRedis(null);

/** Per-shard buffers, only populated when EVENT_BUFFER_SHARDS > 1. */
const shardedEventBuffers: EventBufferRedis[] =
  EVENT_BUFFER_SHARDS > 1
    ? Array.from(
        { length: EVENT_BUFFER_SHARDS },
        (_, i) => new EventBufferRedis(i)
      )
    : [];

/**
 * Returns every event-buffer instance in this process (legacy + all shards).
 * Used by metrics + cron to operate on the full set.
 */
export function getAllEventBufferInstances(): EventBufferRedis[] {
  return [legacyEventBuffer, ...shardedEventBuffers];
}

/**
 * Route a single event to its shard buffer (or to the legacy buffer when
 * sharding is disabled — same key as upstream).
 */
function eventBufferFor(event: IClickhouseEvent): EventBufferRedis {
  if (EVENT_BUFFER_SHARDS <= 1) return legacyEventBuffer;
  const idx = hashEventToShard(event);
  return shardedEventBuffers[idx] ?? legacyEventBuffer;
}

/**
 * Map a result index back to a human-readable buffer name. The first slot
 * is always the legacy buffer; the rest follow the order of
 * shardedEventBuffers.
 */
function bufferLabelForIndex(idx: number): string {
  if (idx === 0) return 'event';
  return `event:${idx - 1}`;
}

/**
 * Walk a Promise.allSettled result set and log any rejected outcomes via
 * the legacy buffer's logger. We intentionally do NOT re-throw — the
 * whole point of allSettled here is per-shard isolation, so a single
 * failing shard must not block the others. But silently dropping the
 * rejection would recreate exactly the silent-stall failure mode the
 * rest of this module is trying to prevent, so we surface it loudly.
 */
function surfaceRejections(
  results: PromiseSettledResult<unknown>[],
  op: 'flush' | 'tryFlush'
): void {
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === 'rejected') {
      legacyEventBuffer.logger.error(
        { err: r.reason, buffer: bufferLabelForIndex(i), op },
        `Unexpected rejection from event buffer ${op}`
      );
    }
  }
}

/**
 * Backward-compatible facade: the singleton callers expect. Routes adds to
 * the correct shard; flush fans out to all buffers in parallel; pending-
 * local count sums across all buffers; observers fan out to every buffer.
 *
 * This is intentionally NOT a full subclass of EventBuffer — we want the
 * surface to be exactly what the rest of the codebase already calls, no more.
 */
export const eventBuffer = {
  /** The legacy/in-process default. Useful when a caller needs a concrete
   *  EventBuffer (e.g. CH SELECT helpers that don't touch the queue). */
  legacy: legacyEventBuffer,

  /** All shard buffers (empty array when sharding is off). */
  shards: shardedEventBuffers,

  /** Sum of pending in-memory events across all buffers in this process. */
  getPendingLocalCount(): number {
    let n = legacyEventBuffer.getPendingLocalCount();
    for (const b of shardedEventBuffers) n += b.getPendingLocalCount();
    return n;
  },

  /** Aggregate LLEN across legacy + all shards (used for healthchecks). */
  async getBufferSize(): Promise<number> {
    const sizes = await Promise.all([
      legacyEventBuffer.getBufferSize().catch(() => 0),
      ...shardedEventBuffers.map((b) => b.getBufferSize().catch(() => 0)),
    ]);
    return sizes.reduce((a, b) => a + b, 0);
  },

  /** Route a single event to its shard. */
  add(event: IClickhouseEvent) {
    eventBufferFor(event).add(event);
  },

  /** Bulk variant — preserves per-shard routing. */
  bulkAdd(events: IClickhouseEvent[]) {
    for (const event of events) {
      eventBufferFor(event).add(event);
    }
  },

  /** Synchronously force a flush of in-memory pending events on ALL buffers. */
  async flush() {
    const results = await Promise.allSettled([
      legacyEventBuffer.flush(),
      ...shardedEventBuffers.map((b) => b.flush()),
    ]);
    surfaceRejections(results, 'flush');
  },

  /**
   * Cron-driven flush. Runs tryFlush on legacy + every shard in parallel.
   * Each tryFlush takes its own per-buffer Redis lock (lock:event,
   * lock:event:0, lock:event:1, ...), so they never serialize on Redis.
   *
   * Per-buffer errors are isolated via Promise.allSettled (a single shard
   * failing must not bring down the others), but any rejection IS logged
   * via `surfaceRejections` — silently swallowing would recreate exactly
   * the silent-stall class of bug this whole module is trying to prevent.
   */
  async tryFlush(options: { trigger?: 'add' | 'cron' } = {}) {
    const results = await Promise.allSettled([
      legacyEventBuffer.tryFlush(options),
      ...shardedEventBuffers.map((b) => b.tryFlush(options)),
    ]);
    surfaceRejections(results, 'tryFlush');
  },

  /** CH SELECT helper — same in legacy + sharded modes. */
  getActiveVisitorCount(projectId: string): Promise<number> {
    return legacyEventBuffer.getActiveVisitorCount(projectId);
  },

  /**
   * Wire flush observer to legacy + all shards. Setter to mirror the
   * original public field semantics on EventBuffer.
   */
  set flushObserver(observer: EventBufferRedis['flushObserver']) {
    legacyEventBuffer.flushObserver = observer;
    for (const b of shardedEventBuffers) b.flushObserver = observer;
  },

  /** Wire add observer to legacy + all shards. */
  set addObserver(observer: EventBufferRedis['addObserver']) {
    legacyEventBuffer.addObserver = observer;
    for (const b of shardedEventBuffers) b.addObserver = observer;
  },

  /** Expose .name for any caller that introspects it (metrics, logs). */
  get name(): string {
    return 'event';
  },
};

export const profileBuffer = new ProfileBufferRedis();
export const botBuffer = new BotBufferRedis();
export const sessionBuffer = new SessionBuffer();
export const profileBackfillBuffer = new ProfileBackfillBuffer();
export const replayBuffer = new ReplayBuffer();
export const groupBuffer = new GroupBuffer();

export type { ProfileBackfillEntry } from './profile-backfill-buffer';
export type { IClickhouseSessionReplayChunk } from './replay-buffer';
