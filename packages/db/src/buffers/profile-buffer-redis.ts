import { createHash } from 'node:crypto';
import { getSafeJson } from '@openpanel/common';
import { type Redis, getRedisCache } from '@openpanel/redis';
import { dissocPath, mergeDeepRight, omit, whereEq } from 'ramda';

import { TABLE_NAMES, ch, chQuery } from '../clickhouse/client';
import type { IClickhouseProfile } from '../services/profile.service';
import { BaseBuffer } from './base-buffer';
import { isPartialMatch } from './partial-json-match';

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

  private excludeKeys(
    profile: IClickhouseProfile,
    exclude: string[][],
  ): IClickhouseProfile {
    let filtered = profile;
    for (const path of exclude) {
      filtered = dissocPath(path, filtered);
    }
    return filtered;
  }

  private match(source: any, partial: any): boolean {
    const exclude = [
      ['created_at'],
      ['properties', 'browser_version'],
      ['properties', 'browserVersion'],
      ['properties', 'latitude'],
      ['properties', 'longitude'],
      ['properties', 'os_version'],
      ['properties', 'osVersion'],
      ['properties', 'path'],
      ['properties', 'referrer_name'],
      ['properties', 'referrerName'],
      ['properties', 'referrer_type'],
      ['properties', 'referrerType'],
      ['properties', 'referrer'],
    ];

    return isPartialMatch(source, this.excludeKeys(partial, exclude));
  }

  async add(profile: IClickhouseProfile) {
    try {
      this.logger.debug('Adding profile', {
        projectId: profile.project_id,
        profileId: profile.id,
        profile,
      });
      const cacheKey = `${this.redisProfilePrefix}${profile.project_id}:${profile.id}`;

      // Check if we have this profile in Redis cache
      const existingProfile = await this.redis.get(cacheKey);
      let mergedProfile = profile;

      if (!existingProfile) {
        this.logger.debug('Profile not found in cache, checking Clickhouse', {
          projectId: profile.project_id,
          profileId: profile.id,
        });
        // If not in cache, check Clickhouse
        const clickhouseProfile = await this.fetchFromClickhouse(profile);
        if (clickhouseProfile) {
          this.logger.debug('Found existing profile in Clickhouse, merging', {
            projectId: profile.project_id,
            profileId: profile.id,
          });
          mergedProfile = mergeDeepRight(clickhouseProfile, profile);
        }
      } else {
        const parsedProfile = getSafeJson<IClickhouseProfile>(existingProfile);

        if (parsedProfile) {
          // Only merge if checksums are different
          if (this.match(parsedProfile, profile)) {
            return; // Skip if checksums match
          }

          this.logger.debug('Profile changed, merging with cached version', {
            existingProfile: parsedProfile,
            incomingProfile: profile,
          });
          mergedProfile = mergeDeepRight(parsedProfile, profile);
        }
      }

      const result = await this.redis
        .multi()
        .set(
          cacheKey,
          JSON.stringify(mergedProfile),
          'EX',
          60 * 60 * 24 * this.daysToKeep,
        )
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

      let processedChunks = 0;
      for (const chunk of this.chunks(parsedProfiles, this.chunkSize)) {
        processedChunks++;
        this.logger.debug(`Processing chunk ${processedChunks}`, {
          size: chunk.length,
        });
        this.logger.debug('Chunk data', { chunk });

        await ch.insert({
          table: TABLE_NAMES.profiles,
          values: chunk,
          format: 'JSONEachRow',
        });
        this.logger.debug(`Successfully inserted chunk ${processedChunks}`);
      }

      // Only remove profiles after successful insert
      await this.redis.ltrim(this.redisBufferKey, profiles.length, -1);

      this.logger.info('Successfully completed profile processing', {
        totalProfiles: profiles.length,
        totalChunks: processedChunks,
      });
    } catch (error) {
      this.logger.error('Failed to process buffer', { error });
    }
  }

  async getBufferSize() {
    return getRedisCache().llen(this.redisBufferKey);
  }
}
