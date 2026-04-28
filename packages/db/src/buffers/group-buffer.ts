import { toDots } from '@openpanel/common';
import { getSafeJson } from '@openpanel/json';
import { getRedisCache, type Redis } from '@openpanel/redis';
import shallowEqual from 'fast-deep-equal';
import sqlstring from 'sqlstring';
import { ch, chQuery, formatClickhouseDate, TABLE_NAMES } from '../clickhouse/client';
import { BaseBuffer } from './base-buffer';

type IGroupBufferEntry = {
  project_id: string;
  id: string;
  type: string;
  name: string;
  properties: Record<string, string>;
  created_at: string;
  version: string;
  deleted: number;
};

type IGroupCacheEntry = {
  id: string;
  project_id: string;
  type: string;
  name: string;
  properties: Record<string, string>;
  created_at: string;
};

export type IGroupBufferInput = {
  id: string;
  projectId: string;
  type: string;
  name: string;
  properties?: Record<string, unknown>;
};

export class GroupBuffer extends BaseBuffer {
  private batchSize = process.env.GROUP_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.GROUP_BUFFER_BATCH_SIZE, 10)
    : 200;
  private chunkSize = process.env.GROUP_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.GROUP_BUFFER_CHUNK_SIZE, 10)
    : 1000;
  private ttlInSeconds = process.env.GROUP_BUFFER_TTL_IN_SECONDS
    ? Number.parseInt(process.env.GROUP_BUFFER_TTL_IN_SECONDS, 10)
    : 60 * 60;

  private readonly redisKey = 'group-buffer';
  private readonly redisCachePrefix = 'group-cache:';

  private redis: Redis;

  constructor() {
    super({
      name: 'group',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
    this.redis = getRedisCache();
  }

  private getCacheKey(projectId: string, id: string) {
    return `${this.redisCachePrefix}${projectId}:${id}`;
  }

  private async fetchFromCache(
    projectId: string,
    id: string
  ): Promise<IGroupCacheEntry | null> {
    const raw = await this.redis.get(this.getCacheKey(projectId, id));
    if (!raw) return null;
    return getSafeJson<IGroupCacheEntry>(raw);
  }

  private async fetchFromClickhouse(
    projectId: string,
    id: string
  ): Promise<IGroupCacheEntry | null> {
    const rows = await chQuery<IGroupCacheEntry>(`
      SELECT project_id, id, type, name, properties, created_at
      FROM ${TABLE_NAMES.groups} FINAL
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND id = ${sqlstring.escape(id)}
        AND deleted = 0
    `);
    return rows[0] ?? null;
  }

  async add(input: IGroupBufferInput): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(input.projectId, input.id);

      const existing =
        (await this.fetchFromCache(input.projectId, input.id)) ??
        (await this.fetchFromClickhouse(input.projectId, input.id));

      const mergedProperties = toDots({
        ...(existing?.properties ?? {}),
        ...(input.properties ?? {}),
      }) as Record<string, string>;

      const entry: IGroupBufferEntry = {
        project_id: input.projectId,
        id: input.id,
        type: input.type,
        name: input.name,
        properties: mergedProperties,
        created_at: formatClickhouseDate(
          existing?.created_at ? new Date(existing.created_at) : new Date()
        ),
        version: String(Date.now()),
        deleted: 0,
      };

      if (
        existing &&
        existing.type === entry.type &&
        existing.name === entry.name &&
        shallowEqual(existing.properties, entry.properties)
      ) {
        this.logger.debug({ id: input.id }, 'Group not changed, skipping');
        return;
      }

      const cacheEntry: IGroupCacheEntry = {
        id: entry.id,
        project_id: entry.project_id,
        type: entry.type,
        name: entry.name,
        properties: entry.properties,
        created_at: entry.created_at,
      };

      const result = await this.redis
        .multi()
        .set(cacheKey, JSON.stringify(cacheEntry), 'EX', this.ttlInSeconds)
        .rpush(this.redisKey, JSON.stringify(entry))
        .incr(this.bufferCounterKey)
        .llen(this.redisKey)
        .exec();

      if (!result) {
        this.logger.error({ input }, 'Failed to add group to Redis');
        return;
      }

      const bufferLength = (result?.[3]?.[1] as number) ?? 0;
      if (bufferLength >= this.batchSize) {
        await this.tryFlush();
      }
    } catch (error) {
      this.logger.error({ err: error, input }, 'Failed to add group');
    }
  }

  async processBuffer(): Promise<void> {
    try {
      this.logger.debug('Starting group buffer processing');
      const items = await this.redis.lrange(this.redisKey, 0, this.batchSize - 1);

      if (items.length === 0) {
        this.logger.debug('No groups to process');
        return;
      }

      this.logger.debug(`Processing ${items.length} groups in buffer`);
      const parsed = items.map((i) => getSafeJson<IGroupBufferEntry>(i));

      for (const chunk of this.chunks(parsed, this.chunkSize)) {
        await ch.insert({
          table: TABLE_NAMES.groups,
          values: chunk,
          format: 'JSONEachRow',
        });
      }

      await this.redis
        .multi()
        .ltrim(this.redisKey, items.length, -1)
        .decrby(this.bufferCounterKey, items.length)
        .exec();

      this.logger.debug(
        { totalGroups: items.length },
        'Successfully completed group processing',
      );
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to process buffer');
    }
  }

  async getBufferSize(): Promise<number> {
    return this.getBufferSizeWithCounter(() => this.redis.llen(this.redisKey));
  }
}
