import { createHash } from 'node:crypto';
import { runEvery } from '@openpanel/redis';
import { mergeDeepRight } from 'ramda';

import { TABLE_NAMES, ch, chQuery } from '../clickhouse-client';
import { db } from '../prisma-client';
import type { IClickhouseProfile } from '../services/profile.service';
import { BaseBuffer } from './base-buffer';

export class ProfileBuffer extends BaseBuffer {
  private daysToKeep = process.env.PROFILE_BUFFER_DAYS_TO_KEEP
    ? Number.parseInt(process.env.PROFILE_BUFFER_DAYS_TO_KEEP, 10)
    : 7;
  private batchSize = process.env.PROFILE_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.PROFILE_BUFFER_CHUNK_SIZE, 10)
    : 2000;
  private chunkSize = process.env.PROFILE_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.PROFILE_BUFFER_CHUNK_SIZE, 10)
    : 1000;

  constructor() {
    super({
      name: 'profile',
      onFlush: async () => {
        await this.processBuffer();
        await this.tryCleanup();
      },
    });
  }

  private sortObjectKeys(obj: any): any {
    // Cache typeof check result
    const type = typeof obj;

    // Fast-path for primitives
    if (obj === null || type !== 'object') {
      return obj;
    }

    // Fast-path for arrays - process values only
    if (Array.isArray(obj)) {
      // Only map if contains objects
      return obj.some((item) => item && typeof item === 'object')
        ? obj.map((item) => this.sortObjectKeys(item))
        : obj;
    }

    // Get and sort keys once
    const sortedKeys = Object.keys(obj).sort();
    const len = sortedKeys.length;

    // Pre-allocate result object
    const result: any = {};

    // Single loop with cached length
    for (let i = 0; i < len; i++) {
      const key = sortedKeys[i]!;
      const value = obj[key];
      result[key] =
        value && typeof value === 'object' ? this.sortObjectKeys(value) : value;
    }

    return result;
  }

  private stringify(profile: IClickhouseProfile): string {
    const { created_at, ...rest } = profile;
    const sorted = this.sortObjectKeys(rest);
    return JSON.stringify(sorted);
  }

  private generateChecksum(profile: IClickhouseProfile): string {
    const json = this.stringify(profile);
    return createHash('sha256').update(json).digest('hex');
  }

  async add(profile: IClickhouseProfile) {
    try {
      const checksum = this.generateChecksum(profile);
      // Check if we have this exact profile in buffer
      const existingProfile = await db.profileBuffer.findFirst({
        where: {
          projectId: profile.project_id,
          profileId: profile.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Last item in buffer is the same as the new profile
      if (existingProfile?.checksum === checksum) {
        this.logger.debug('Duplicate profile ignored', {
          profileId: profile.id,
        });
        return;
      }

      let mergedProfile = profile;

      if (!existingProfile) {
        this.logger.debug('No profile in buffer, checking Clickhouse', {
          profileId: profile.id,
        });
        // If not in buffer, check Clickhouse
        const clickhouseProfile = await this.fetchFromClickhouse(profile);
        if (clickhouseProfile) {
          this.logger.debug('Clickhouse profile found, merging', {
            profileId: profile.id,
          });
          mergedProfile = mergeDeepRight(clickhouseProfile, profile);
        }
      } else if (existingProfile.payload) {
        this.logger.debug('Profile in buffer is different, merging', {
          profileId: profile.id,
        });
        mergedProfile = mergeDeepRight(existingProfile.payload, profile);
      }

      // Update existing profile if its not processed yet
      if (existingProfile) {
        await db.profileBuffer.update({
          where: {
            id: existingProfile.id,
          },
          data: {
            checksum: this.generateChecksum(mergedProfile),
            payload: mergedProfile,
            updatedAt: new Date(),
            processedAt: null,
          },
        });
      } else {
        // Create new profile
        await db.profileBuffer.create({
          data: {
            projectId: profile.project_id,
            profileId: profile.id,
            checksum,
            payload: mergedProfile,
          },
        });
      }
    } catch (error) {
      this.logger.error('Failed to add profile', { error });
    }
  }

  private async fetchFromClickhouse(
    profile: IClickhouseProfile,
  ): Promise<IClickhouseProfile | null> {
    const result = await chQuery<IClickhouseProfile>(
      `SELECT *
       FROM ${TABLE_NAMES.profiles}
       WHERE project_id = '${profile.project_id}'
         AND id = '${profile.id}'
       ORDER BY created_at DESC
       LIMIT 1`,
    );

    return result[0] || null;
  }

  async processBuffer() {
    const profilesToProcess = await db.profileBuffer.findMany({
      where: {
        processedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: this.batchSize,
    });

    if (profilesToProcess.length > 0) {
      const toInsert = profilesToProcess.map((p) => {
        const profile = p.payload;
        return profile;
      });

      for (const chunk of this.chunks(profilesToProcess, this.chunkSize)) {
        await ch.insert({
          table: TABLE_NAMES.profiles,
          values: chunk,
          format: 'JSONEachRow',
        });
      }

      await db.profileBuffer.updateMany({
        where: {
          id: {
            in: profilesToProcess.map((p) => p.id),
          },
        },
        data: {
          processedAt: new Date(),
        },
      });

      this.logger.info('Processed profiles', {
        count: toInsert.length,
      });
    }
  }

  async tryCleanup() {
    try {
      await runEvery({
        interval: 60 * 60, // 1 hour
        fn: this.cleanup.bind(this),
        key: `${this.name}-cleanup`,
      });
    } catch (error) {
      this.logger.error('Failed to run cleanup', { error });
    }
  }

  async cleanup() {
    const olderThan = new Date();
    olderThan.setDate(olderThan.getDate() - this.daysToKeep);

    const deleted = await db.profileBuffer.deleteMany({
      where: {
        processedAt: {
          lt: olderThan,
        },
      },
    });

    this.logger.info('Cleaned up old profiles', { deleted: deleted.count });
  }
}
