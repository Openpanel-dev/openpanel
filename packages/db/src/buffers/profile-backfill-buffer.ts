import { getSafeJson } from '@openpanel/json';
import { type Redis, getRedisCache } from '@openpanel/redis';
import sqlstring from 'sqlstring';
import { TABLE_NAMES, ch, getReplicatedTableName } from '../clickhouse/client';
import { BaseBuffer } from './base-buffer';

export interface ProfileBackfillEntry {
  projectId: string;
  sessionId: string;
  profileId: string;
}

// Max session IDs per IN clause before we split into another query
const CHUNK_SIZE = 500;

export class ProfileBackfillBuffer extends BaseBuffer {
  private batchSize = process.env.PROFILE_BACKFILL_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.PROFILE_BACKFILL_BUFFER_BATCH_SIZE, 10)
    : 1000;

  private readonly redisKey = 'profile-backfill-buffer';
  private redis: Redis;

  constructor() {
    super({
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
        this.logger.info({ entry }, 'Adding profile backfill entry');
        await this.redis.rpush(this.redisKey, JSON.stringify(entry));
      } catch (error) {
        this.logger.error(
          { err: error },
          'Failed to add profile backfill entry',
        );
      }
    });
  }


  protected getRedisListKey(): string {
    return this.redisKey;
  }

  async processBuffer() {
    const lrangeStart = performance.now();
    const raw = await this.redis.lrange(this.redisKey, 0, this.batchSize - 1);
    const lrangeMs = performance.now() - lrangeStart;

    if (raw.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return;
    }

    // Deduplicate by sessionId — last write wins (most recent profileId)
    const seen = new Map<string, ProfileBackfillEntry>();
    for (const r of raw) {
      const parsed = getSafeJson<ProfileBackfillEntry>(r);
      if (parsed) {
        seen.set(parsed.sessionId, parsed);
      }
    }
    const entries = Array.from(seen.values());

    const table = getReplicatedTableName(TABLE_NAMES.events);

    const chunks = this.chunks(entries, CHUNK_SIZE);
    let processedChunks = 0;

    const chStart = performance.now();
    for (const chunk of chunks) {
      const caseClause = chunk
        .map(({ sessionId, profileId }) => `WHEN ${sqlstring.escape(sessionId)} THEN ${sqlstring.escape(profileId)}`)
        .join('\n');
      const tupleList = chunk
        .map(({ projectId, sessionId }) => `(${sqlstring.escape(projectId)}, ${sqlstring.escape(sessionId)})`)
        .join(',');

      const query = `
        UPDATE ${table}
        SET profile_id = CASE session_id
          ${caseClause}
        END
        WHERE (project_id, session_id) IN (${tupleList})
          AND created_at > now() - INTERVAL 6 HOURS`;

      await ch.command({
        query,
        clickhouse_settings: {
          mutations_sync: '0',
          allow_experimental_lightweight_update: '1'
        },
      });

      processedChunks++;
    }
    const chInsertMs = performance.now() - chStart;

    let trimMs: number | undefined;
    if (processedChunks === chunks.length) {
      const trimStart = performance.now();
      await this.redis.ltrim(this.redisKey, raw.length, -1);
      trimMs = performance.now() - trimStart;
    }

    this.reportFlushStats({
      rowsProcessed: raw.length,
      phases: { lrangeMs, chInsertMs, trimMs },
    });
  }
}
