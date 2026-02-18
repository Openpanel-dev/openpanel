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
    try {
      this.logger.info('Adding profile backfill entry', entry);
      await this.redis
        .multi()
        .rpush(this.redisKey, JSON.stringify(entry))
        .incr(this.bufferCounterKey)
        .exec();
    } catch (error) {
      this.logger.error('Failed to add profile backfill entry', { error });
    }
  }

  async processBuffer() {
    try {
      const raw = await this.redis.lrange(this.redisKey, 0, this.batchSize - 1);

      if (raw.length === 0) return;

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
        this.logger.info('Profile backfill chunk applied', {
          count: chunk.length,
        });
      }

      if (processedChunks === chunks.length) {
        await this.redis
          .multi()
          .ltrim(this.redisKey, raw.length, -1)
          .decrby(this.bufferCounterKey, raw.length)
          .exec();

        this.logger.info('Profile backfill buffer processed', {
          total: entries.length,
        });
      }
    } catch (error) {
      this.logger.error('Failed to process profile backfill buffer', { error });
    }
  }

  async getBufferSize() {
    return this.getBufferSizeWithCounter(() => this.redis.llen(this.redisKey));
  }
}
