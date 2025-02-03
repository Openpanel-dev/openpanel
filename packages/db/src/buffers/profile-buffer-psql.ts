import { createHash } from 'node:crypto';
import { generateSecureId } from '@openpanel/common/server/id';
import { type ILogger as Logger, createLogger } from '@openpanel/logger';
import { getRedisCache, runEvery } from '@openpanel/redis';
import { mergeDeepRight } from 'ramda';

import { TABLE_NAMES, ch, chQuery } from '../clickhouse-client';
import { db } from '../prisma-client';
import type { IClickhouseProfile } from '../services/profile.service';
import { BaseBuffer } from './base-buffer';

export class ProfileBuffer extends BaseBuffer {
  private daysToKeep = 30;
  private batchSize = process.env.EVENT_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_CHUNK_SIZE, 10)
    : 2000;
  private chunkSize = process.env.EVENT_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_CHUNK_SIZE, 10)
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

  private generateChecksum(profile: IClickhouseProfile): string {
    const { created_at, ...rest } = profile;
    return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
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
      if (existingProfile && existingProfile.processedAt === null) {
        await db.profileBuffer.update({
          where: {
            id: existingProfile.id,
          },
          data: {
            checksum: this.generateChecksum(mergedProfile),
            payload: mergedProfile,
            updatedAt: new Date(),
            processedAt: null, // unsure this will get processed (race condition)
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
        interval: 1000 * 60 * 60 * 24,
        fn: this.cleanup.bind(this),
        key: `${this.name}-cleanup`,
      });
    } catch (error) {
      this.logger.error('Failed to run cleanup', { error });
    }
  }

  async cleanup() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - this.daysToKeep);

    const deleted = await db.profileBuffer.deleteMany({
      where: {
        processedAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    this.logger.info('Cleaned up old profiles', { deleted: deleted.count });
  }
}
