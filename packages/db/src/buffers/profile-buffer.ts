import { deepMergeObjects } from '@openpanel/common';
import { getSafeJson } from '@openpanel/json';
import { getRedisCache, type Redis } from '@openpanel/redis';
import { omit, uniq } from 'ramda';
import sqlstring from 'sqlstring';
import { ch, chQuery, TABLE_NAMES } from '../clickhouse/client';
import type { IClickhouseProfile } from '../services/profile.service';
import { BaseBuffer } from './base-buffer';

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

  async add(profile: IClickhouseProfile, isFromEvent = false) {
    try {
      if (isFromEvent) {
        const cacheKey = this.getProfileCacheKey({
          profileId: profile.id,
          projectId: profile.project_id,
        });
        const exists = await this.redis.exists(cacheKey);
        if (exists === 1) {
          return;
        }
      }

      const result = await this.redis
        .multi()
        .rpush(this.redisKey, JSON.stringify(profile))
        .incr(this.bufferCounterKey)
        .llen(this.redisKey)
        .exec();

      if (!result) {
        this.logger.error('Failed to add profile to Redis', { profile });
        return;
      }

      const bufferLength = (result?.[2]?.[1] as number) ?? 0;
      if (bufferLength >= this.batchSize) {
        await this.tryFlush();
      }
    } catch (error) {
      this.logger.error('Failed to add profile', { error, profile });
    }
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
          const rows = await chQuery<IClickhouseProfile>(
            `SELECT
              id,
              project_id,
              argMax(nullIf(first_name, ''), ${TABLE_NAMES.profiles}.created_at) as first_name,
              argMax(nullIf(last_name, ''), ${TABLE_NAMES.profiles}.created_at) as last_name,
              argMax(nullIf(email, ''), ${TABLE_NAMES.profiles}.created_at) as email,
              argMax(nullIf(avatar, ''), ${TABLE_NAMES.profiles}.created_at) as avatar,
              argMax(is_external, ${TABLE_NAMES.profiles}.created_at) as is_external,
              argMax(properties, ${TABLE_NAMES.profiles}.created_at) as properties,
              max(created_at) as created_at
            FROM ${TABLE_NAMES.profiles}
            WHERE (id, project_id) IN (${tuples})
            ${withDateFilter ? `AND ${TABLE_NAMES.profiles}.created_at > now() - INTERVAL 2 DAY` : ''}
            GROUP BY id, project_id`
          );
          for (const row of rows) {
            result.set(`${row.project_id}:${row.id}`, row);
          }
        } catch (error) {
          this.logger.warn(
            'Failed to batch fetch profiles from Clickhouse, proceeding without existing data',
            { error, chunkSize: chunk.length }
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

  async processBuffer() {
    try {
      this.logger.debug('Starting profile buffer processing');
      const rawProfiles = await this.redis.lrange(
        this.redisKey,
        0,
        this.batchSize - 1
      );

      if (rawProfiles.length === 0) {
        this.logger.debug('No profiles to process');
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
          this.mergeProfiles(mergedInBatch.get(key) ?? null, profile)
        );
      }

      const uniqueProfiles = Array.from(mergedInBatch.values());

      // Check Redis cache for all unique profiles in a single MGET
      const cacheKeys = uniqueProfiles.map((p) =>
        this.getProfileCacheKey({ profileId: p.id, projectId: p.project_id })
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

      // Fetch cache misses from ClickHouse in bounded chunks
      if (cacheMisses.length > 0) {
        const clickhouseResults =
          await this.batchFetchFromClickhouse(cacheMisses);
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
          profile
        );
        toInsert.push(merged);
        multi.set(
          this.getProfileCacheKey({
            projectId: profile.project_id,
            profileId: profile.id,
          }),
          JSON.stringify(merged),
          'EX',
          this.ttlInSeconds
        );
      }

      for (const chunk of this.chunks(toInsert, this.chunkSize)) {
        await ch.insert({
          table: TABLE_NAMES.profiles,
          values: chunk,
          format: 'JSONEachRow',
        });
      }

      multi
        .ltrim(this.redisKey, rawProfiles.length, -1)
        .decrby(this.bufferCounterKey, rawProfiles.length);
      await multi.exec();

      this.logger.debug('Successfully completed profile processing', {
        totalProfiles: rawProfiles.length,
        uniqueProfiles: uniqueProfiles.length,
      });
    } catch (error) {
      this.logger.error('Failed to process buffer', { error });
    }
  }

  getBufferSize() {
    return this.getBufferSizeWithCounter(() => this.redis.llen(this.redisKey));
  }
}
