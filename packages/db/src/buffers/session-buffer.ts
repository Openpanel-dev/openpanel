import { DateTime } from '@openpanel/common';
import { getSafeJson } from '@openpanel/json';
import { getRedisCache, type Redis } from '@openpanel/redis';
import { ch, TABLE_NAMES } from '../clickhouse/client';
import type { IServiceCreateEventPayload } from '../services/event.service';
import type { IClickhouseSession } from '../services/session.service';
import { BaseBuffer } from './base-buffer';

// 30min of idle in event-time → session ends. Matches industry default.
// Idle window for a session (boundary detection + the reaper's default deadman).
// Env-overridable so E2E tests can shrink it from 30min to a few seconds.
export const SESSION_TIMEOUT_MS = Number.parseInt(
  process.env.SESSION_TIMEOUT_MS || String(1000 * 60 * 30),
  10
);

const sessionKey = (projectId: string, deviceId: string) =>
  `session:${projectId}:${deviceId}`;
const profileIndexKey = (projectId: string, profileId: string) =>
  `session:profile:${projectId}:${profileId}`;
const wallclockSetKey = (projectId: string) =>
  `session:wallclock:${projectId}`;
const PROJECTS_SET_KEY = 'session:projects';

// Atomic id-gated cleanup. Only deletes the blob + sorted-set entry +
// profile pointer if the live blob's session id matches the one we're
// closing. Prevents races where a boundary has already overwritten the slot
// with a new session.
const CLEANUP_LUA = `
local cur = redis.call('GET', KEYS[1])
if cur then
  local ok, parsed = pcall(cjson.decode, cur)
  if ok and parsed and parsed.id ~= ARGV[1] then
    return 0
  end
end
redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], ARGV[2])
if KEYS[3] ~= '' then
  redis.call('DEL', KEYS[3])
end
return 1
`;

export type SessionIngestResult =
  | { kind: 'new'; current: IClickhouseSession }
  | { kind: 'extend'; current: IClickhouseSession }
  | { kind: 'boundary'; current: IClickhouseSession; closed: IClickhouseSession };

function toClickhouseDate(date: Date): string {
  return DateTime.fromJSDate(date)
    .setZone('UTC')
    .toFormat('yyyy-MM-dd HH:mm:ss.SSS');
}

function fromClickhouseDate(s: string): Date {
  return DateTime.fromFormat(s, 'yyyy-MM-dd HH:mm:ss.SSS', {
    zone: 'UTC',
  }).toJSDate();
}

function pickUtm(
  payload: IServiceCreateEventPayload,
  key: 'utm_medium' | 'utm_source' | 'utm_campaign' | 'utm_content' | 'utm_term'
): string {
  const query = (payload.properties as { __query?: Record<string, unknown> } | undefined)
    ?.__query;
  const v = query?.[key];
  return v ? String(v) : '';
}

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

  /**
   * Look up the active session for a device, either directly by deviceId or
   * via the profile index (`session:profile:{pid}:{profileId}` → deviceId).
   */
  public async getExistingSession(
    options:
      | { projectId: string; deviceId: string }
      | { projectId: string; profileId: string }
  ): Promise<IClickhouseSession | null> {
    if ('deviceId' in options) {
      const hit = await this.redis.get(
        sessionKey(options.projectId, options.deviceId)
      );
      return hit ? getSafeJson<IClickhouseSession>(hit) : null;
    }
    const deviceId = await this.redis.get(
      profileIndexKey(options.projectId, options.profileId)
    );
    if (!deviceId) return null;
    const hit = await this.redis.get(sessionKey(options.projectId, deviceId));
    return hit ? getSafeJson<IClickhouseSession>(hit) : null;
  }

  /**
   * Ingest one event into the session lifecycle.
   *
   * Reads the device's current session (if any), decides whether the event
   * extends it, opens a brand-new one, or boundaries (gap > 30min) → close
   * the old session and start a fresh one. Writes the updated session blob,
   * updates the wall-clock index, and queues CollapsingMergeTree rows for
   * ClickHouse.
   *
   * Returns the action taken so the caller can drive session_start /
   * session_end event emission. `session_start` / `session_end` events
   * themselves are skipped — they are derived signals, not session activity.
   */
  async ingest(
    payload: IServiceCreateEventPayload
  ): Promise<SessionIngestResult | null> {
    if (!payload.projectId || !payload.deviceId) return null;
    if (payload.name === 'session_start' || payload.name === 'session_end') {
      return null;
    }

    try {
      const existing = await this.getExistingSession({
        projectId: payload.projectId,
        deviceId: payload.deviceId,
      });

      const eventTimeMs = payload.createdAt.getTime();
      const isBoundary =
        existing &&
        eventTimeMs - fromClickhouseDate(existing.ended_at).getTime() >
          SESSION_TIMEOUT_MS;

      if (existing && !isBoundary) {
        const { current, chRows } = this.extendSession(existing, payload);
        await this.persist(current, chRows);
        return { kind: 'extend', current };
      }

      const current = this.newSession(payload);
      await this.persist(current, [current]);

      if (existing && isBoundary) {
        return { kind: 'boundary', current, closed: existing };
      }
      return { kind: 'new', current };
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to ingest session');
      return null;
    }
  }

  /**
   * Remove a closed session from Redis. Atomically gated on `sessionId` via
   * Lua: if a different session now occupies the `(projectId, deviceId)`
   * slot (because a boundary already overwrote it with a new session), the
   * call is a no-op — the new session still needs its blob and sorted-set
   * entry.
   *
   * Blobs no longer have a Redis TTL — this is the only path that removes
   * them. The daily vacuum cron is a backstop for the rare case where this
   * fails (worker crash, network partition).
   */
  async cleanup({
    projectId,
    deviceId,
    sessionId,
    profileId,
  }: {
    projectId: string;
    deviceId: string;
    sessionId: string;
    profileId?: string | null;
  }): Promise<void> {
    const pointerKey =
      profileId && profileId !== deviceId
        ? profileIndexKey(projectId, profileId)
        : '';

    await this.redis.eval(
      CLEANUP_LUA,
      3,
      sessionKey(projectId, deviceId),
      wallclockSetKey(projectId),
      pointerKey,
      sessionId,
      deviceId
    );
  }

  /**
   * Extend an in-flight session with a new event. Returns the updated
   * session AND the pair of CollapsingMergeTree rows that ClickHouse needs
   * to replace the previous row (sign=-1 cancels, sign=+1 inserts).
   */
  private extendSession(
    existing: IClickhouseSession,
    payload: IServiceCreateEventPayload
  ): {
    current: IClickhouseSession;
    chRows: [IClickhouseSession, IClickhouseSession];
  } {
    const oldRow: IClickhouseSession = { ...existing, sign: -1 };
    const current: IClickhouseSession = {
      ...existing,
      sign: 1,
      version: existing.version + 1,
    };

    // Out-of-order safety: treat the session window as [min(event ts),
    // max(event ts)]. Late-arriving events (offline mobile flush, retries)
    // can't drag ended_at backwards or push duration negative.
    const eventTimeMs = payload.createdAt.getTime();
    const startMs = fromClickhouseDate(current.created_at).getTime();
    const endMs = fromClickhouseDate(current.ended_at).getTime();
    const eventCh = toClickhouseDate(payload.createdAt);

    if (eventTimeMs >= endMs) {
      current.ended_at = eventCh;
      if (payload.path) current.exit_path = payload.path;
      if (payload.origin) current.exit_origin = payload.origin;
    }

    if (eventTimeMs < startMs) {
      current.created_at = eventCh;
      if (payload.path) current.entry_path = payload.path;
      if (payload.origin) current.entry_origin = payload.origin;
    } else {
      if (!current.entry_path && payload.path) current.entry_path = payload.path;
      if (!current.entry_origin && payload.origin)
        current.entry_origin = payload.origin;
    }

    current.duration =
      fromClickhouseDate(current.ended_at).getTime() -
      fromClickhouseDate(current.created_at).getTime();

    if (payload.name === 'revenue') {
      current.revenue = (current.revenue ?? 0) + (payload.revenue ?? 0);
    }

    if (payload.name === 'screen_view' && payload.path) {
      current.screen_view_count += 1;
    } else {
      current.event_count += 1;
    }

    if (current.screen_view_count > 1) {
      current.is_bounce = false;
    }

    if (payload.profileId && payload.profileId !== payload.deviceId) {
      current.profile_id = payload.profileId;
    }

    if (payload.groups?.length) {
      current.groups = [
        ...new Set([...(current.groups ?? []), ...payload.groups]),
      ];
    }

    return { current, chRows: [current, oldRow] };
  }

  /**
   * Open a brand-new session from this event's payload. Called for the first
   * event of a device AND on boundary (gap > 30min closing the old session).
   */
  private newSession(payload: IServiceCreateEventPayload): IClickhouseSession {
    const createdAt = toClickhouseDate(payload.createdAt);
    // For anonymous traffic the SDK doesn't send a profileId — fall back to
    // the deviceId so each anonymous device shows up as a unique visitor in
    // the dashboard. Matches what `createEvent` does for the events table.
    const profileId = payload.profileId || payload.deviceId;
    return {
      id: payload.sessionId,
      project_id: payload.projectId,
      device_id: payload.deviceId,
      profile_id: profileId,
      is_bounce: true,
      created_at: createdAt,
      ended_at: createdAt,
      event_count: payload.name === 'screen_view' ? 0 : 1,
      screen_view_count: payload.name === 'screen_view' ? 1 : 0,
      entry_path: payload.path ?? '',
      entry_origin: payload.origin ?? '',
      exit_path: payload.path ?? '',
      exit_origin: payload.origin ?? '',
      revenue: payload.name === 'revenue' ? (payload.revenue ?? 0) : 0,
      referrer: payload.referrer ?? '',
      referrer_name: payload.referrerName ?? '',
      referrer_type: payload.referrerType ?? '',
      os: payload.os ?? '',
      os_version: payload.osVersion ?? '',
      browser: payload.browser ?? '',
      browser_version: payload.browserVersion ?? '',
      device: payload.device ?? '',
      brand: payload.brand ?? '',
      model: payload.model ?? '',
      country: payload.country ?? '',
      region: payload.region ?? '',
      city: payload.city ?? '',
      longitude: payload.longitude ?? null,
      latitude: payload.latitude ?? null,
      duration: payload.duration ?? 0,
      utm_medium: pickUtm(payload, 'utm_medium'),
      utm_source: pickUtm(payload, 'utm_source'),
      utm_campaign: pickUtm(payload, 'utm_campaign'),
      utm_content: pickUtm(payload, 'utm_content'),
      utm_term: pickUtm(payload, 'utm_term'),
      groups: payload.groups ?? [],
      sign: 1,
      version: 1,
    };
  }

  /**
   * Atomic write-back: session blob + wallclock ZSET + projects SET +
   * profile index + ClickHouse buffer rows + counter.
   *
   * No TTLs on the blob or profile index — they are removed exclusively by
   * `cleanup()` after `session_end` emission. This guarantees the reaper
   * can always find a session's state regardless of how long the worker
   * has been down.
   */
  private async persist(
    current: IClickhouseSession,
    chRows: IClickhouseSession[]
  ) {
    const projectId = current.project_id;
    const deviceId = current.device_id;
    const wallClockMs = Date.now();

    const multi = this.redis.multi();
    multi.set(sessionKey(projectId, deviceId), JSON.stringify(current));
    multi.zadd(wallclockSetKey(projectId), wallClockMs.toString(), deviceId);
    multi.sadd(PROJECTS_SET_KEY, projectId);

    if (current.profile_id && current.profile_id !== current.device_id) {
      multi.set(profileIndexKey(projectId, current.profile_id), deviceId);
    }

    for (const row of chRows) {
      multi.rpush(this.redisKey, JSON.stringify(row));
    }
    await multi.exec();

    const bufferLength = await this.getBufferSize();
    if (bufferLength >= this.batchSize) {
      await this.tryFlush();
    }
  }

  /**
   * Squash the (sign=-1, sign=+1) rows for each session id down to the
   * minimal set that produces the same collapsed state in ClickHouse, by
   * netting the signs per version. Single-row sessions pass through
   * unchanged.
   *
   * `sessions` uses VersionedCollapsingMergeTree(sign, version): a (-1, V)
   * row only collapses against a (+1, V) row of the SAME version. So the
   * net effect of a batch on a session is computed per-version — sum the
   * signs at each version and emit only the rows needed to realise that
   * net. Versions that fully cancel (net 0) are dropped; the surviving
   * rows are normally the final (+1, maxVersion) plus, for a mid-life
   * session, the (-1, V) that cancels CH's resident row.
   *
   * This per-version netting is required because a session's creation row
   * (+1 at the base version) can land in the SAME batch as its updates.
   * The first update emits a (-1, baseVersion) whose only partner is that
   * in-batch creation (+1, baseVersion). They must cancel each other here;
   * naively keeping "oldest -1 + newest +1" would drop the creation +1
   * while keeping its canceller, leaving a permanently un-collapsible (-1)
   * row in CH (duplicate session rows + negative bounce counts).
   */
  private squashSessionsByVersion(
    sessions: IClickhouseSession[]
  ): IClickhouseSession[] {
    if (sessions.length <= 1) {
      return sessions;
    }

    const grouped = new Map<string, IClickhouseSession[]>();
    for (const s of sessions) {
      const arr = grouped.get(s.id);
      if (arr) {
        arr.push(s);
      } else {
        grouped.set(s.id, [s]);
      }
    }

    let squashedCount = 0;
    const out: IClickhouseSession[] = [];

    for (const entries of grouped.values()) {
      if (entries.length === 1) {
        out.push(entries[0]!);
        continue;
      }

      const netByVersion = new Map<
        number,
        { net: number; pos?: IClickhouseSession; neg?: IClickhouseSession }
      >();
      for (const e of entries) {
        const slot = netByVersion.get(e.version) ?? { net: 0 };
        slot.net += e.sign;
        if (e.sign === 1) {
          slot.pos = e;
        } else if (e.sign === -1) {
          slot.neg = e;
        }
        netByVersion.set(e.version, slot);
      }

      const emitted: IClickhouseSession[] = [];
      for (const slot of netByVersion.values()) {
        if (slot.net === 0) {
          continue;
        }
        const row = slot.net > 0 ? slot.pos : slot.neg;
        if (!row) {
          continue;
        }
        for (let i = 0; i < Math.abs(slot.net); i++) {
          emitted.push(row);
        }
      }

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
        'Session batch squashed'
      );
    }

    return out;
  }

  async processBuffer() {
    const events = await this.redis.lrange(
      this.redisKey,
      0,
      this.batchSize - 1
    );
    if (events.length === 0) return;

    const parsed: IClickhouseSession[] = [];
    for (const e of events) {
      const s = getSafeJson<IClickhouseSession>(e);
      if (!s) continue;
      // Freshly parsed object — safe to clamp in place, no clone needed.
      s.duration = Math.max(0, s.duration || 0);
      parsed.push(s);
    }

    // A single high-activity session produces many (sign=-1, sign=+1)
    // pairs within one flush window — every extend appends a pair. The
    // VersionedCollapsingMergeTree collapses them at merge time, so the
    // final state is correct either way, but inserting all the
    // intermediate rows costs network bytes, gzip CPU, and CH ingest +
    // merge work. Squash per-version to insert only the boundary rows.
    //
    // Set SESSION_BUFFER_SQUASH=false to disable as a safety hatch.
    const sessions = this.squashEnabled
      ? this.squashSessionsByVersion(parsed)
      : parsed;

    for (const chunk of this.chunks(sessions, this.chunkSize)) {
      await ch.insert({
        table: TABLE_NAMES.sessions,
        values: chunk,
        format: 'JSONEachRow',
      });
    }

    // Trim only after a successful insert — on failure the rows stay queued.
    // Don't swallow: let it propagate so the base flush records result:'error'
    // (and the next flush retries the still-queued rows).
    await this.redis.ltrim(this.redisKey, events.length, -1);

    this.logger.debug({ count: events.length }, 'Processed sessions');
  }

  protected getRedisListKey(): string {
    return this.redisKey;
  }
}
