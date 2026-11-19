import { sql } from '@openpanel/db/src/clickhouse/sql';
import { getRedisCache, type Redis } from '@openpanel/redis';
import { getSafeJson, toDots } from '@openpanel/shared';
import shallowEqual from 'fast-deep-equal';
import { formatClickhouseDate } from '../shared/ch-dates';
import { TABLE_NAMES } from '../shared/ch-tables';
import { BaseBuffer, type BufferDeps } from './base-buffer';

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

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_TTL_IN_SECONDS = 60 * 60;

export class GroupBuffer extends BaseBuffer {
  private readonly batchSize =
    this.deps.config.buffers.group.batchSize ?? DEFAULT_BATCH_SIZE;
  private readonly chunkSize =
    this.deps.config.buffers.group.chunkSize ?? DEFAULT_CHUNK_SIZE;
  private readonly ttlInSeconds =
    this.deps.config.buffers.group.ttlSeconds ?? DEFAULT_TTL_IN_SECONDS;

  private readonly redisKey = 'group-buffer';
  private readonly redisCachePrefix = 'group-cache:';

  private readonly redis: Redis;

  constructor(deps: BufferDeps) {
    super(deps, {
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
    if (!raw) {
      return null;
    }
    return getSafeJson<IGroupCacheEntry>(raw);
  }

  private async fetchFromClickhouse(
    projectId: string,
    id: string
  ): Promise<IGroupCacheEntry | null> {
    const rows = await this.chQuery<IGroupCacheEntry>(sql`
      SELECT project_id, id, type, name, properties, created_at
      FROM ${sql.id(TABLE_NAMES.groups)} FINAL
      WHERE project_id = ${sql.string(projectId)}
        AND id = ${sql.string(id)}
        AND deleted = 0
    `);
    return rows[0] ?? null;
  }

  async add(input: IGroupBufferInput): Promise<void> {
    return this.timeAdd(async () => {
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
          .exec();

        if (!result) {
          this.logger.error({ input }, 'Failed to add group to Redis');
        }
      } catch (error) {
        this.logger.error({ err: error, input }, 'Failed to add group');
      }
    });
  }

  protected getRedisListKey(): string {
    return this.redisKey;
  }

  async processBuffer(): Promise<void> {
    await this.drainBatches(this.batchSize, () => this.processBatch());
  }

  private async processBatch(): Promise<number> {
    const lrangeStart = performance.now();
    const items = await this.redis.lrange(this.redisKey, 0, this.batchSize - 1);
    const lrangeMs = performance.now() - lrangeStart;

    if (items.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return 0;
    }

    // Raw passthrough: each Redis entry is already a JSONEachRow line.
    const ch = this.resolveCh();
    const chStart = performance.now();
    await this.parallelLimit(this.chunks(items, this.chunkSize), (chunk) =>
      ch.insert({
        table: TABLE_NAMES.groups,
        values: this.jsonEachRowStream(chunk),
        format: 'JSONEachRow',
        clickhouse_settings: this.getClickhouseSettings(),
      })
    );
    const chInsertMs = performance.now() - chStart;

    const trimStart = performance.now();
    await this.redis.ltrim(this.redisKey, items.length, -1);
    const trimMs = performance.now() - trimStart;

    this.reportFlushStats({
      rowsProcessed: items.length,
      phases: { lrangeMs, chInsertMs, trimMs },
    });
    return items.length;
  }
}
