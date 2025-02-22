import { deepMergeObjects } from '@openpanel/common';
// import { getSafeJson } from '@openpanel/json';
import { type Redis, getRedisCache } from '@openpanel/redis';
import shallowEqual from 'fast-deep-equal';
import { omit } from 'ramda';
import { TABLE_NAMES, ch, chQuery } from '../clickhouse/client';
import type { IClickhouseProfile } from '../services/profile.service';
import { BaseBuffer } from './base-buffer';

// TODO: Use @openpanel/json when polar is merged
function getSafeJson<T>(str: string): T | null {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

export class ProfileBuffer extends BaseBuffer {
  private batchSize = process.env.PROFILE_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.PROFILE_BUFFER_BATCH_SIZE, 10)
    : 200;
  private daysToKeep = process.env.PROFILE_BUFFER_DAYS_TO_KEEP
    ? Number.parseInt(process.env.PROFILE_BUFFER_DAYS_TO_KEEP, 10)
    : 7;
  private chunkSize = process.env.PROFILE_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.PROFILE_BUFFER_CHUNK_SIZE, 10)
    : 1000;

  private readonly redisBufferKey = 'profile-buffer';
  private readonly redisProfilePrefix = 'profile-cache:';

  private redis: Redis;

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

  async add(profile: IClickhouseProfile) {
    try {
      this.logger.debug('Adding profile', {
        projectId: profile.project_id,
        profileId: profile.id,
      });

      const existingProfile = await this.fetchFromCache(profile);

      const mergedProfile: IClickhouseProfile = existingProfile
        ? deepMergeObjects(existingProfile, profile)
        : profile;

      // Avoid unnecessary updates:
      // If the profile is less than X minutes old
      // and the profiles are the same
      if (profile.created_at && existingProfile?.created_at) {
        const a = new Date(profile.created_at);
        const b = new Date(existingProfile.created_at);
        const diffTime = Math.abs(a.getTime() - b.getTime());
        if (
          diffTime < 1000 * 60 * 10 &&
          shallowEqual(
            omit(['created_at'], existingProfile),
            omit(['created_at'], mergedProfile),
          )
        ) {
          this.logger.debug('Profile not changed, skipping');
          return;
        }
      }

      this.logger.debug('Merged profile will be inserted', {
        mergedProfile,
        existingProfile,
        profile,
      });

      const cacheTtl = profile.is_external
        ? 60 * 60 * 24 * this.daysToKeep
        : 60 * 60; // 1 hour for internal profiles
      const cacheKey = this.getProfileCacheKey({
        profileId: profile.id,
        projectId: profile.project_id,
      });

      const result = await this.redis
        .multi()
        .set(cacheKey, JSON.stringify(mergedProfile), 'EX', cacheTtl)
        .rpush(this.redisBufferKey, JSON.stringify(mergedProfile))
        .llen(this.redisBufferKey)
        .exec();

      if (!result) {
        this.logger.error('Failed to add profile to Redis', {
          profile,
          cacheKey,
        });
        return;
      }
      const bufferLength = (result?.[2]?.[1] as number) ?? 0;

      this.logger.debug('Current buffer length', {
        bufferLength,
        batchSize: this.batchSize,
      });
      if (bufferLength >= this.batchSize) {
        this.logger.info('Buffer full, initiating flush');
        await this.tryFlush();
      }
    } catch (error) {
      this.logger.error('Failed to add profile', { error, profile });
    }
  }

  private async fetchFromCache(
    profile: IClickhouseProfile,
  ): Promise<IClickhouseProfile | null> {
    this.logger.debug('Fetching profile from Redis', {
      projectId: profile.project_id,
      profileId: profile.id,
    });
    const cacheKey = this.getProfileCacheKey({
      profileId: profile.id,
      projectId: profile.project_id,
    });

    const existingProfile = await getRedisCache().get(cacheKey);
    if (existingProfile) {
      const parsedProfile = getSafeJson<IClickhouseProfile>(existingProfile);
      if (parsedProfile) {
        this.logger.debug('Profile found in Redis', {
          projectId: profile.project_id,
          profileId: profile.id,
        });
        return parsedProfile;
      }
    }

    return this.fetchFromClickhouse(profile);
  }

  private async fetchFromClickhouse(
    profile: IClickhouseProfile,
  ): Promise<IClickhouseProfile | null> {
    this.logger.debug('Fetching profile from Clickhouse', {
      projectId: profile.project_id,
      profileId: profile.id,
    });
    const result = await chQuery<IClickhouseProfile>(
      `SELECT *
       FROM ${TABLE_NAMES.profiles}
       WHERE project_id = '${profile.project_id}'
         AND id = '${profile.id}'
         ${
           profile.is_external === false
             ? 'AND created_at > now() - INTERVAL 2 DAY'
             : ''
         }
       ORDER BY created_at DESC
       LIMIT 1`,
    );

    this.logger.debug('Clickhouse fetch result', {
      found: !!result[0],
      projectId: profile.project_id,
      profileId: profile.id,
    });
    return result[0] || null;
  }

  async processBuffer() {
    try {
      this.logger.info('Starting profile buffer processing');
      const profiles = await this.redis.lrange(
        this.redisBufferKey,
        0,
        this.batchSize - 1,
      );

      if (profiles.length === 0) {
        this.logger.debug('No profiles to process');
        return;
      }

      this.logger.info(`Processing ${profiles.length} profiles in buffer`);
      const parsedProfiles = profiles.map((p) =>
        getSafeJson<IClickhouseProfile>(p),
      );

      for (const chunk of this.chunks(parsedProfiles, this.chunkSize)) {
        await ch.insert({
          table: TABLE_NAMES.profiles,
          values: chunk,
          format: 'JSONEachRow',
        });
      }

      // Only remove profiles after successful insert
      await this.redis.ltrim(this.redisBufferKey, profiles.length, -1);

      this.logger.info('Successfully completed profile processing', {
        totalProfiles: profiles.length,
      });
    } catch (error) {
      this.logger.error('Failed to process buffer', { error });
    }
  }

  async getBufferSize() {
    return getRedisCache().llen(this.redisBufferKey);
  }
}
