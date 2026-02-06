import { deepMergeObjects } from '@openpanel/common';
import { getSafeJson } from '@openpanel/json';
import type { ILogger } from '@openpanel/logger';
import { type Redis, getRedisCache } from '@openpanel/redis';
import shallowEqual from 'fast-deep-equal';
import { omit } from 'ramda';
import sqlstring from 'sqlstring';
import { TABLE_NAMES, ch, chQuery } from '../clickhouse/client';
import type { IClickhouseProfile } from '../services/profile.service';
import { BaseBuffer } from './base-buffer';

export class ProfileBuffer extends BaseBuffer {
  private batchSize = process.env.PROFILE_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.PROFILE_BUFFER_BATCH_SIZE, 10)
    : 200;
  private chunkSize = process.env.PROFILE_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.PROFILE_BUFFER_CHUNK_SIZE, 10)
    : 1000;
  private ttlInSeconds = process.env.PROFILE_BUFFER_TTL_IN_SECONDS
    ? Number.parseInt(process.env.PROFILE_BUFFER_TTL_IN_SECONDS, 10)
    : 60 * 60;

  private readonly redisKey = 'profile-buffer';
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

  async alreadyExists(profile: IClickhouseProfile) {
    const cacheKey = this.getProfileCacheKey({
      profileId: profile.id,
      projectId: profile.project_id,
    });
    return (await this.redis.exists(cacheKey)) === 1;
  }

  async add(profile: IClickhouseProfile, isFromEvent = false) {
    const logger = this.logger.child({
      projectId: profile.project_id,
      profileId: profile.id,
    });

    try {
      logger.debug('Adding profile');

      if (isFromEvent && (await this.alreadyExists(profile))) {
        logger.debug('Profile already created, skipping');
        return;
      }

      const existingProfile = await this.fetchProfile(profile, logger);

      // Delete any properties that are not server related if we have a non-server profile
      if (
        existingProfile?.properties.device !== 'server' &&
        profile.properties.device === 'server'
      ) {
        profile.properties = omit(
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
          profile.properties,
        );
      }

      const mergedProfile: IClickhouseProfile = existingProfile
        ? deepMergeObjects(existingProfile, omit(['created_at'], profile))
        : profile;

      if (profile && existingProfile) {
        if (
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

      const cacheKey = this.getProfileCacheKey({
        profileId: profile.id,
        projectId: profile.project_id,
      });

      const result = await this.redis
        .multi()
        .set(cacheKey, JSON.stringify(mergedProfile), 'EX', this.ttlInSeconds)
        .rpush(this.redisKey, JSON.stringify(mergedProfile))
        .incr(this.bufferCounterKey)
        .llen(this.redisKey)
        .exec();

      if (!result) {
        this.logger.error('Failed to add profile to Redis', {
          profile,
          cacheKey,
        });
        return;
      }
      const bufferLength = (result?.[3]?.[1] as number) ?? 0;

      this.logger.debug('Current buffer length', {
        bufferLength,
        batchSize: this.batchSize,
      });
      if (bufferLength >= this.batchSize) {
        await this.tryFlush();
      }
    } catch (error) {
      this.logger.error('Failed to add profile', { error, profile });
    }
  }

  private async fetchProfile(
    profile: IClickhouseProfile,
    logger: ILogger,
  ): Promise<IClickhouseProfile | null> {
    const existingProfile = await this.fetchFromCache(
      profile.id,
      profile.project_id,
    );
    if (existingProfile) {
      logger.debug('Profile found in Redis');
      return existingProfile;
    }

    return this.fetchFromClickhouse(profile, logger);
  }

  public async fetchFromCache(
    profileId: string,
    projectId: string,
  ): Promise<IClickhouseProfile | null> {
    const cacheKey = this.getProfileCacheKey({
      profileId,
      projectId,
    });
    const existingProfile = await this.redis.get(cacheKey);
    if (!existingProfile) {
      return null;
    }
    return getSafeJson<IClickhouseProfile>(existingProfile);
  }

  private async fetchFromClickhouse(
    profile: IClickhouseProfile,
    logger: ILogger,
  ): Promise<IClickhouseProfile | null> {
    logger.debug('Fetching profile from Clickhouse');
    const result = await chQuery<IClickhouseProfile>(
      `SELECT 
        id, 
        project_id,
        last_value(nullIf(first_name, '')) as first_name, 
        last_value(nullIf(last_name, '')) as last_name, 
        last_value(nullIf(email, '')) as email, 
        last_value(nullIf(avatar, '')) as avatar, 
        last_value(is_external) as is_external, 
        last_value(properties) as properties, 
        last_value(created_at) as created_at
      FROM ${TABLE_NAMES.profiles} 
      WHERE 
        id = ${sqlstring.escape(String(profile.id))} AND 
        project_id = ${sqlstring.escape(profile.project_id)}
        ${
          profile.is_external === false
            ? ' AND profiles.created_at > now() - INTERVAL 2 DAY'
            : ''
        }
      GROUP BY id, project_id 
      ORDER BY created_at DESC 
      LIMIT 1`,
    );
    logger.debug('Clickhouse fetch result', {
      found: !!result[0],
    });
    return result[0] || null;
  }

  async processBuffer() {
    try {
      this.logger.debug('Starting profile buffer processing');
      const profiles = await this.redis.lrange(
        this.redisKey,
        0,
        this.batchSize - 1,
      );

      if (profiles.length === 0) {
        this.logger.debug('No profiles to process');
        return;
      }

      this.logger.debug(`Processing ${profiles.length} profiles in buffer`);
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

      // Only remove profiles after successful insert and update counter
      await this.redis
        .multi()
        .ltrim(this.redisKey, profiles.length, -1)
        .decrby(this.bufferCounterKey, profiles.length)
        .exec();

      this.logger.debug('Successfully completed profile processing', {
        totalProfiles: profiles.length,
      });
    } catch (error) {
      this.logger.error('Failed to process buffer', { error });
    }
  }

  async getBufferSize() {
    return this.getBufferSizeWithCounter(() => this.redis.llen(this.redisKey));
  }
}
