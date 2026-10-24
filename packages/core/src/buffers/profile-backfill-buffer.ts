// A session that gets identified halfway through leaves its earlier events on
// the device id. When such a session closes, this buffer rewrites those rows
// to the identified profile with a lightweight UPDATE bounded to the session's
// own time span, and feeds the same rows into the profile-keyed materialized
// views, which skipped them as anonymous on insert.
//
// Only rows still anonymous (`profile_id = device_id`) are touched, so a
// logout followed by another user's login in the same session never moves
// the first user's events, and a retried flush is a no-op.

import { createHash } from 'node:crypto';
import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import { getRedisCache, type Redis } from '@openpanel/redis';
import { getSafeJson } from '@openpanel/shared';
import { replicatedTarget, TABLE_NAMES } from '../shared/ch-tables';
import { BaseBuffer, type BufferDeps } from './base-buffer';

export interface ProfileBackfillEntry {
  projectId: string;
  sessionId: string;
  profileId: string;
  /** The closed session's bounds, ClickHouse `YYYY-MM-DD HH:mm:ss`. */
  startedAt: string;
  endedAt: string;
}

// Four statements per chunk each repeat the session list as bound params, so
// the chunk stays well under ClickHouse's URI size limit.
const CHUNK_SIZE = 200;
const DEFAULT_BATCH_SIZE = 1000;
// session_start lands 100 ms before the first event and `ended_at` has second
// precision; one second each side covers both.
const WINDOW_PADDING_SECONDS = 1;
// Lightweight UPDATE became the default-on Beta in 25.8; older servers only
// have heavyweight mutations, which cannot run once per closed session.
const MIN_LIGHTWEIGHT_UPDATE_VERSION = { major: 25, minor: 8 };

// A retried batch is read from the same list head, so its chunks are the same
// sessions in the same order; the markers only have to outlive one retry.
const VIEW_MARKER_TTL_SECONDS = 60 * 60;

function chunkKey(chunk: ProfileBackfillEntry[]): string {
  return createHash('sha1')
    .update(
      chunk.map((entry) => `${entry.sessionId}=${entry.profileId}`).join(',')
    )
    .digest('hex');
}

export function supportsLightweightUpdate(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  if (major !== MIN_LIGHTWEIGHT_UPDATE_VERSION.major) {
    return major > MIN_LIGHTWEIGHT_UPDATE_VERSION.major;
  }
  return minor >= MIN_LIGHTWEIGHT_UPDATE_VERSION.minor;
}

export class ProfileBackfillBuffer extends BaseBuffer {
  private readonly batchSize =
    this.deps.config.buffers.profileBackfill.batchSize ?? DEFAULT_BATCH_SIZE;

  private readonly redisKey = 'profile-backfill-buffer';
  private readonly redis: Redis;
  private lightweightUpdateSupported: Promise<boolean> | null = null;

  constructor(deps: BufferDeps) {
    super(deps, {
      name: 'profile-backfill',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
    this.redis = getRedisCache();
  }

  async add(entry: ProfileBackfillEntry) {
    return this.timeAdd(async () => {
      try {
        await this.redis.rpush(this.redisKey, JSON.stringify(entry));
      } catch (error) {
        this.logger.error(
          { err: error },
          'Failed to add profile backfill entry'
        );
      }
    });
  }

  protected getRedisListKey(): string {
    return this.redisKey;
  }

  private checkLightweightUpdateSupport(): Promise<boolean> {
    this.lightweightUpdateSupported ??= this.chQuery<{ version: string }>(
      'SELECT version() AS version'
    )
      .then(([row]) => {
        const version = row?.version ?? '';
        const supported = supportsLightweightUpdate(version);
        if (!supported) {
          this.logger.warn(
            { version },
            'ClickHouse has no lightweight UPDATE; identified sessions keep their anonymous events'
          );
        }
        return supported;
      })
      .catch((error: unknown) => {
        // A failed probe (ClickHouse restarting) must not be the answer forever.
        this.lightweightUpdateSupported = null;
        throw error;
      });
    return this.lightweightUpdateSupported;
  }

  async processBuffer() {
    const lrangeStart = performance.now();
    const raw = await this.redis.lrange(this.redisKey, 0, this.batchSize - 1);
    const lrangeMs = performance.now() - lrangeStart;

    if (raw.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return;
    }

    if (!(await this.checkLightweightUpdateSupport())) {
      await this.redis.ltrim(this.redisKey, raw.length, -1);
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return;
    }

    // Last entry per session wins: a session re-closed with a newer profile.
    const seen = new Map<string, ProfileBackfillEntry>();
    for (const item of raw) {
      const parsed = getSafeJson<ProfileBackfillEntry>(item);
      if (parsed?.startedAt && parsed.endedAt) {
        seen.set(parsed.sessionId, parsed);
      }
    }
    // A chunk's WHERE spans its earliest start to its latest end, so sessions
    // the vacuum closed a day late must not widen the span of the fresh ones.
    const byStart = Array.from(seen.values()).sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt)
    );
    const chunks = this.chunks(byStart, CHUNK_SIZE);

    // A failing statement throws out of here and leaves the batch in Redis
    // for the next flush. The rewrite is idempotent; the view inserts are
    // not, so each one leaves a marker and the retry skips it.
    const chStart = performance.now();
    for (const chunk of chunks) {
      await this.rewriteChunk(chunk);
    }
    const chInsertMs = performance.now() - chStart;

    const trimStart = performance.now();
    await this.redis.ltrim(this.redisKey, raw.length, -1);
    const trimMs = performance.now() - trimStart;

    this.logger.info(
      { sessions: seen.size, chunks: chunks.length },
      'Rewrote anonymous events of identified sessions'
    );
    this.reportFlushStats({
      rowsProcessed: raw.length,
      phases: { lrangeMs, chInsertMs, trimMs },
    });
  }

  /** The views first, from the rows as they are now; then the rewrite. */
  private async rewriteChunk(chunk: ProfileBackfillEntry[]): Promise<void> {
    const resolvedProfileId = sql`CASE session_id ${sql.join(
      chunk.map(
        ({ sessionId, profileId }) =>
          sql`WHEN ${sql.string(sessionId)} THEN ${sql.string(profileId)}`
      ),
      ' '
    )} ELSE profile_id END`;
    const anonymousRowsOfChunk = this.anonymousRowsOfChunk(chunk);

    const key = chunkKey(chunk);
    const inserts = this.viewInserts(
      resolvedProfileId,
      anonymousRowsOfChunk
    ).map((statement, index) => ({
      statement,
      marker: `${this.redisKey}:views-done:${key}:${index}`,
    }));
    for (const { statement, marker } of inserts) {
      if (await this.redis.exists(marker)) {
        continue;
      }
      await this.command(statement);
      await this.redis.set(marker, '1', 'EX', VIEW_MARKER_TTL_SECONDS);
    }
    const markers = inserts.map((insert) => insert.marker);

    // `replicatedTarget`, not `sql.id`: the clustered form carries an
    // `ON CLUSTER` clause and is not a bare identifier.
    const target = replicatedTarget(
      this.deps.config.clickhouseClustered,
      TABLE_NAMES.events
    );
    await this.command(
      sql`UPDATE ${target} SET profile_id = ${resolvedProfileId} WHERE ${anonymousRowsOfChunk}`,
      { allow_experimental_lightweight_update: '1' }
    );
    await this.redis.del(...markers);
  }

  /** The chunk's sessions, within their joint time span, still anonymous. */
  private anonymousRowsOfChunk(chunk: ProfileBackfillEntry[]): SqlFragment {
    const sessionTuples = sql.join(
      chunk.map(
        ({ projectId, sessionId }) =>
          sql`(${sql.string(projectId)}, ${sql.string(sessionId)})`
      ),
      ', '
    );
    const startedAt = chunk.map((entry) => entry.startedAt).sort()[0] ?? '';
    const endedAt =
      chunk
        .map((entry) => entry.endedAt)
        .sort()
        .at(-1) ?? '';
    const padding = sql.uint64(WINDOW_PADDING_SECONDS);
    return sql`(project_id, session_id) IN (${sessionTuples})
      AND created_at BETWEEN toDateTime64(${sql.string(startedAt)}, 3) - toIntervalSecond(${padding})
        AND toDateTime64(${sql.string(endedAt)}, 3) + toIntervalSecond(${padding})
      AND profile_id = device_id`;
  }

  /**
   * The three views keyed on identified profiles. Their anonymous rows were
   * never stored, so every row here is new; `cohort_events_mv` keeps the first
   * plain `event_count` per key and is read for membership only.
   */
  private viewInserts(
    resolvedProfileId: SqlFragment,
    anonymousRows: SqlFragment
  ): SqlFragment[] {
    const events = sql.id(TABLE_NAMES.events);
    return [
      sql`INSERT INTO ${sql.id(TABLE_NAMES.cohort_events_mv)} (project_id, name, created_at, profile_id, event_count)
        SELECT project_id, name, toDate(created_at) AS event_date, ${resolvedProfileId} AS resolved_profile_id, count()
        FROM ${events}
        WHERE ${anonymousRows}
        GROUP BY project_id, name, event_date, resolved_profile_id`,
      sql`INSERT INTO ${sql.id(TABLE_NAMES.event_profile_summary_mv)} (project_id, profile_id, name, event_date, event_count, first_event_time, last_event_time, total_duration)
        SELECT project_id, ${resolvedProfileId} AS resolved_profile_id, name, toStartOfDay(created_at) AS event_date,
          countState(), minState(created_at), maxState(created_at), sumState(duration)
        FROM ${events}
        WHERE ${anonymousRows}
        GROUP BY project_id, resolved_profile_id, name, event_date`,
      sql`INSERT INTO ${sql.id(TABLE_NAMES.event_property_profile_summary_mv)} (project_id, profile_id, name, property_key, property_value, event_date, event_count, first_event_time, last_event_time)
        SELECT project_id, ${resolvedProfileId} AS resolved_profile_id, name, property_key, property_value, toStartOfDay(created_at) AS event_date,
          countState(), minState(created_at), maxState(created_at)
        FROM ${events}
        ARRAY JOIN mapKeys(properties) AS property_key, mapValues(properties) AS property_value
        WHERE ${anonymousRows} AND property_key != '' AND property_value != ''
        GROUP BY project_id, resolved_profile_id, name, property_key, property_value, event_date`,
    ];
  }

  private async command(
    fragment: SqlFragment,
    settings?: Record<string, string>
  ): Promise<void> {
    const statement = fragment.toStatement();
    await this.resolveCh().command({
      query: statement.query,
      query_params: statement.query_params,
      clickhouse_settings: settings,
    });
  }
}
