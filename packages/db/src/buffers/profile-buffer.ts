import { deepMergeObjects } from '@openpanel/common';
import { getSafeJson } from '@openpanel/json';
import { getRedisCache, type Redis } from '@openpanel/redis';
import { omit, uniq } from 'ramda';
import sqlstring from 'sqlstring';
import { ch, chQuery, TABLE_NAMES } from '../clickhouse/client';
import type { IClickhouseProfile } from '../services/profile.service';
import { BaseBuffer } from './base-buffer';

// Inlined to avoid a circular value-import with `profile.service.ts`
// (which imports `profileBuffer` from `../buffers`). Keep this in sync
// with the `PROFILE_COLUMNS` constant there.
const PROFILE_COLUMNS =
  'id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups';

// Equivalent of `SELECT ... FROM profiles FINAL` but expressed via GROUP BY +
// argMax. ReplicatedReplacingMergeTree uses `last_seen_at` as the version
// column, so argMax(col, last_seen_at) yields the same value FINAL would
// produce. Avoiding FINAL lets CH use the primary key (project_id, id) to
// scan instead of merging parts at query time — order(s) of magnitude
// faster on the profile-buffer's fetch path.
//
// `p.last_seen_at` is qualified with the FROM-clause table alias because
// the SELECT exposes a `last_seen_at` aggregate alias, and CH resolves
// bare column refs against the alias list first — causing ILLEGAL_AGGREGATION
// inside the argMax/max calls. Qualifying with `p.` bypasses the alias
// lookup and binds to the raw column.
const PROFILE_LATEST_AGGREGATE_COLUMNS = [
  'id',
  'project_id',
  'argMax(first_name, p.last_seen_at) AS first_name',
  'argMax(last_name, p.last_seen_at) AS last_name',
  'argMax(email, p.last_seen_at) AS email',
  'argMax(avatar, p.last_seen_at) AS avatar',
  'argMax(properties, p.last_seen_at) AS properties',
  'argMax(is_external, p.last_seen_at) AS is_external',
  'argMax(groups, p.last_seen_at) AS groups',
  // created_at doesn't change between rows for the same profile, but
  // min() is safe and matches "first seen" semantics if there ever is a
  // discrepancy.
  'min(created_at) AS created_at',
  'max(p.last_seen_at) AS last_seen_at',
].join(', ');

export class ProfileBuffer extends BaseBuffer {
  private readonly batchSize = process.env.PROFILE_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.PROFILE_BUFFER_BATCH_SIZE, 10)
    : 200;
  private readonly chunkSize = process.env.PROFILE_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.PROFILE_BUFFER_CHUNK_SIZE, 10)
    : 1000;
  private readonly ttlInSeconds = process.env.PROFILE_BUFFER_TTL_IN_SECONDS
    ? Number.parseInt(process.env.PROFILE_BUFFER_TTL_IN_SECONDS, 10)
    : 60 * 60;
  /** Max profiles per ClickHouse IN-clause fetch to keep query size bounded */
  private readonly fetchChunkSize = process.env.PROFILE_BUFFER_FETCH_CHUNK_SIZE
    ? Number.parseInt(process.env.PROFILE_BUFFER_FETCH_CHUNK_SIZE, 10)
    : 50;

  private readonly redisKey = 'profile-buffer';
  private readonly redisProfilePrefix = 'profile-cache:';

  private readonly redis: Redis;

  constructor() {
    super({
      name: 'profile',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
    this.redis = getRedisCache();
  }

  private getProfileCacheKey({
    projectId,
    profileId,
  }: {
    profileId: string;
    projectId: string;
  }) {
    return `${this.redisProfilePrefix}${projectId}:${profileId}`;
  }

  public async fetchFromCache(
    profileId: string,
    projectId: string
  ): Promise<IClickhouseProfile | null> {
    const cacheKey = this.getProfileCacheKey({ profileId, projectId });
    const cached = await this.redis.get(cacheKey);
    if (!cached) {
      return null;
    }
    return getSafeJson<IClickhouseProfile>(cached);
  }

  public async setCache(profile: IClickhouseProfile): Promise<void> {
    const cacheKey = this.getProfileCacheKey({
      profileId: profile.id,
      projectId: profile.project_id,
    });
    await this.redis.set(
      cacheKey,
      JSON.stringify(profile),
      'EX',
      this.ttlInSeconds
    );
  }

  async add(profile: IClickhouseProfile, isFromEvent = false) {
    return this.timeAdd(async () => {
      try {
        if (isFromEvent) {
          const cacheKey = this.getProfileCacheKey({
            profileId: profile.id,
            projectId: profile.project_id,
          });
          const exists = await this.redis.exists(cacheKey);
          if (exists === 1) {
            this.reportAddSkipped('cached');
            return;
          }
        }

        const result = await this.redis
          .multi()
          .rpush(this.redisKey, JSON.stringify(profile))
          .llen(this.redisKey)
          .exec();

        if (!result) {
          this.logger.error({ profile }, 'Failed to add profile to Redis');
          return;
        }

        const bufferLength = (result?.[1]?.[1] as number) ?? 0;
        if (bufferLength >= this.batchSize) {
          await this.tryFlush({ trigger: 'add' });
        }
      } catch (error) {
        this.logger.error({ err: error, profile }, 'Failed to add profile');
      }
    });
  }

  private mergeProfiles(
    existing: IClickhouseProfile | null,
    incoming: IClickhouseProfile
  ): IClickhouseProfile {
    if (!existing) {
      return incoming;
    }

    let profile = incoming;
    if (
      existing.properties.device !== 'server' &&
      incoming.properties.device === 'server'
    ) {
      profile = {
        ...incoming,
        properties: omit(
          [
            'city',
            'country',
            'region',
            'longitude',
            'latitude',
            'os',
            'osVersion',
            'browser',
            'device',
            'isServer',
            'os_version',
            'browser_version',
          ],
          incoming.properties
        ),
      };
    }

    return {
      // `created_at` is preserved (existing wins → first seen stays put).
      // `last_seen_at` flows through from incoming so the RMT version advances.
      // `groups` get unioned below.
      ...deepMergeObjects(existing, omit(['created_at', 'groups'], profile)),
      groups: uniq([...(existing.groups ?? []), ...(incoming.groups ?? [])]),
    };
  }

  private async batchFetchFromClickhouse(
    profiles: IClickhouseProfile[]
  ): Promise<Map<string, IClickhouseProfile>> {
    const result = new Map<string, IClickhouseProfile>();

    // Non-external (anonymous/device) profiles get a 2-day recency filter to
    // avoid pulling stale anonymous sessions from far back.
    const external = profiles.filter((p) => p.is_external !== false);
    const nonExternal = profiles.filter((p) => p.is_external === false);

    const fetchGroup = async (
      group: IClickhouseProfile[],
      withDateFilter: boolean
    ) => {
      for (const chunk of this.chunks(group, this.fetchChunkSize)) {
        const tuples = chunk
          .map(
            (p) =>
              `(${sqlstring.escape(String(p.id))}, ${sqlstring.escape(p.project_id)})`
          )
          .join(', ');
        try {
          // Table alias `p` is required: without it, WHERE's `last_seen_at`
          // resolves to the SELECT-list aggregate alias `max(last_seen_at) AS
          // last_seen_at`, which is an aggregate function and illegal in WHERE
          // (CH ILLEGAL_AGGREGATION). Qualifying with `p.` bypasses the alias
          // lookup and binds to the raw column.
          const rows = await chQuery<IClickhouseProfile>(
            `SELECT ${PROFILE_LATEST_AGGREGATE_COLUMNS}
            FROM ${TABLE_NAMES.profiles} AS p
            WHERE (p.id, p.project_id) IN (${tuples})
            ${withDateFilter ? `AND p.last_seen_at > now() - INTERVAL 2 DAY` : ''}
            GROUP BY p.id, p.project_id`
          );
          for (const row of rows) {
            result.set(`${row.project_id}:${row.id}`, row);
          }
        } catch (error) {
          this.logger.warn(
            { err: error, chunkSize: chunk.length },
            'Failed to batch fetch profiles from Clickhouse, proceeding without existing data'
          );
        }
      }
    };

    await Promise.all([
      fetchGroup(external, false),
      fetchGroup(nonExternal, true),
    ]);

    return result;
  }

  protected getRedisListKey(): string {
    return this.redisKey;
  }

  async processBuffer() {
    const lrangeStart = performance.now();
    const rawProfiles = await this.redis.lrange(
      this.redisKey,
      0,
      this.batchSize - 1,
    );
    const lrangeMs = performance.now() - lrangeStart;

    if (rawProfiles.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return;
    }

    const parsedProfiles = rawProfiles
      .map((p) => getSafeJson<IClickhouseProfile>(p))
      .filter(Boolean) as IClickhouseProfile[];

    // Merge within batch: collapse multiple updates for the same profile
    const mergedInBatch = new Map<string, IClickhouseProfile>();
    for (const profile of parsedProfiles) {
      const key = `${profile.project_id}:${profile.id}`;
      mergedInBatch.set(
        key,
        this.mergeProfiles(mergedInBatch.get(key) ?? null, profile),
      );
    }

    const uniqueProfiles = Array.from(mergedInBatch.values());

    // Check Redis cache for all unique profiles in a single MGET
    const cacheKeys = uniqueProfiles.map((p) =>
      this.getProfileCacheKey({ profileId: p.id, projectId: p.project_id }),
    );
    const cacheResults = await this.redis.mget(...cacheKeys);

    const existingByKey = new Map<string, IClickhouseProfile>();
    const cacheMisses: IClickhouseProfile[] = [];
    for (let i = 0; i < uniqueProfiles.length; i++) {
      const uniqueProfile = uniqueProfiles[i];
      if (uniqueProfile) {
        const key = `${uniqueProfile.project_id}:${uniqueProfile.id}`;
        const cached = cacheResults[i]
          ? getSafeJson<IClickhouseProfile>(cacheResults[i]!)
          : null;
        if (cached) {
          existingByKey.set(key, cached);
        } else {
          cacheMisses.push(uniqueProfile);
        }
      }
    }

    // Fetch cache misses from ClickHouse in bounded chunks. Timed separately
    // from the ch.insert phase because it can dominate flush time for
    // profile-buffer specifically (FINAL replaced with argMax + GROUP BY in
    // batchFetchFromClickhouse, but worth measuring directly).
    let chFetchMs: number | undefined;
    if (cacheMisses.length > 0) {
      const chFetchStart = performance.now();
      const clickhouseResults =
        await this.batchFetchFromClickhouse(cacheMisses);
      chFetchMs = performance.now() - chFetchStart;
      for (const [key, profile] of clickhouseResults) {
        existingByKey.set(key, profile);
      }
    }

    // Final merge: in-batch profile + existing (from cache or ClickHouse)
    const toInsert: IClickhouseProfile[] = [];
    const multi = this.redis.multi();

    for (const profile of uniqueProfiles) {
      const key = `${profile.project_id}:${profile.id}`;
      const merged = this.mergeProfiles(
        existingByKey.get(key) ?? null,
        profile,
      );
      toInsert.push(merged);
      multi.set(
        this.getProfileCacheKey({
          projectId: profile.project_id,
          profileId: profile.id,
        }),
        JSON.stringify(merged),
        'EX',
        this.ttlInSeconds,
      );
    }

    const chStart = performance.now();
    for (const chunk of this.chunks(toInsert, this.chunkSize)) {
      await ch.insert({
        table: TABLE_NAMES.profiles,
        values: chunk,
        format: 'JSONEachRow',
      });
    }
    const chInsertMs = performance.now() - chStart;

    const trimStart = performance.now();
    multi.ltrim(this.redisKey, rawProfiles.length, -1);
    await multi.exec();
    const trimMs = performance.now() - trimStart;

    this.reportFlushStats({
      rowsProcessed: rawProfiles.length,
      phases: { lrangeMs, chFetchMs, chInsertMs, trimMs },
    });
  }
}
