import { groupBy, mergeDeepRight, prop } from 'ramda';

import { toDots } from '@openpanel/common';
import { getRedisCache } from '@openpanel/redis';

import { escape } from 'sqlstring';
import {
  TABLE_NAMES,
  ch,
  chQuery,
  formatClickhouseDate,
} from '../clickhouse-client';
import { transformProfile } from '../services/profile.service';
import type {
  IClickhouseProfile,
  IServiceProfile,
} from '../services/profile.service';
import type { Find, FindMany } from './buffer';
import { RedisBuffer } from './buffer';

const BATCH_SIZE = process.env.BATCH_SIZE_PROFILES
  ? Number.parseInt(process.env.BATCH_SIZE_PROFILES, 10)
  : 50;

type BufferType = IClickhouseProfile;
export class ProfileBuffer extends RedisBuffer<BufferType> {
  constructor() {
    super('profiles', BATCH_SIZE);
  }

  // this will do a couple of things:
  // - we slice the queue to maxBufferSize since this queries have a limit on character count
  // - check redis cache for profiles
  // - fetch missing profiles from clickhouse
  // - merge the incoming profile with existing data
  protected async processItems(
    items: BufferType[],
  ): Promise<{ toInsert: BufferType[]; toKeep: BufferType[] }> {
    const queue = this.combineQueueItems(items);
    const slicedQueue = this.maxBufferSize
      ? queue.slice(0, this.maxBufferSize)
      : queue;
    const redisProfiles = await this.getCachedProfiles(slicedQueue);
    const dbProfiles = await this.fetchDbProfiles(
      slicedQueue.filter((_, index) => !redisProfiles[index]),
    );

    const toInsert = this.createProfileValues(
      slicedQueue,
      redisProfiles,
      dbProfiles,
    );

    if (toInsert.length > 0) {
      await this.updateRedisCache(toInsert);
    }

    return Promise.resolve({
      toInsert,
      toKeep: this.maxBufferSize ? queue.slice(this.maxBufferSize) : [],
    });
  }

  private combineQueueItems(queue: BufferType[]): BufferType[] {
    const itemsToClickhouse = new Map<string, BufferType>();

    queue.forEach((item) => {
      const key = item.project_id + item.id;
      const existing = itemsToClickhouse.get(key);
      itemsToClickhouse.set(key, mergeDeepRight(existing ?? {}, item));
    });

    return Array.from(itemsToClickhouse.values());
  }

  protected async insertIntoDB(items: BufferType[]): Promise<void> {
    await ch.insert({
      table: TABLE_NAMES.profiles,
      values: items.map((item) => ({
        ...item,
        created_at: item.created_at
          ? formatClickhouseDate(item.created_at)
          : '',
      })),
      format: 'JSONEachRow',
    });
  }

  private matchPartialObject(
    full: any,
    partial: any,
    options: { ignore: string[] },
  ): boolean {
    if (typeof partial !== 'object' || partial === null) {
      return partial === full;
    }

    for (const key in partial) {
      if (options.ignore.includes(key)) {
        continue;
      }

      if (
        !(key in full) ||
        !this.matchPartialObject(full[key], partial[key], options)
      ) {
        return false;
      }
    }

    return true;
  }

  private async getCachedProfiles(
    queue: BufferType[],
  ): Promise<(IClickhouseProfile | null)[]> {
    const redisCache = getRedisCache();
    const keys = queue.map((item) => `profile:${item.project_id}:${item.id}`);

    if (keys.length === 0) {
      return [];
    }

    const cachedProfiles = await redisCache.mget(...keys);
    return cachedProfiles.map((profile) => {
      try {
        return profile ? JSON.parse(profile) : null;
      } catch (error) {
        return null;
      }
    });
  }

  private async fetchDbProfiles(
    queue: IClickhouseProfile[],
  ): Promise<IClickhouseProfile[]> {
    if (queue.length === 0) {
      return [];
    }

    // const grouped = groupBy(prop('project_id'), queue);
    // const queries = Object.entries(grouped).map(([project_id, items]) => {
    //   if (!items) {
    //     return [];
    //   }

    //   return chQuery<IClickhouseProfile>(
    //     `SELECT
    //       *
    //     FROM ${TABLE_NAMES.profiles}
    //     WHERE
    //         id IN (${items.map((item) => escape(item.id)).join(',')})
    //         AND created_at > INTERVAL 12 MONTH
    //     ORDER BY
    //         created_at DESC`,
    //   );
    // });

    return await chQuery<IClickhouseProfile>(
      `SELECT 
          *
        FROM ${TABLE_NAMES.profiles}
        WHERE 
            (project_id, id) IN (${queue.map((item) => `('${item.project_id}', '${item.id}')`).join(',')})
        ORDER BY
            created_at DESC`,
    );
  }

  private createProfileValues(
    queue: IClickhouseProfile[],
    redisProfiles: (IClickhouseProfile | null)[],
    dbProfiles: IClickhouseProfile[],
  ): IClickhouseProfile[] {
    return queue
      .map((item, index) => {
        const cachedProfile = redisProfiles[index];
        const dbProfile = dbProfiles.find(
          (p) => p.id === item.id && p.project_id === item.project_id,
        );
        const profile = cachedProfile || dbProfile;

        if (
          profile &&
          this.matchPartialObject(
            profile,
            {
              ...item,
              properties: toDots(item.properties),
            },
            {
              ignore: ['created_at'],
            },
          )
        ) {
          this.logger.debug('No changes for profile', {
            profile,
          });
          return null;
        }

        return {
          id: item.id,
          first_name: item.first_name ?? profile?.first_name ?? '',
          last_name: item.last_name ?? profile?.last_name ?? '',
          email: item.email ?? profile?.email ?? '',
          avatar: item.avatar ?? profile?.avatar ?? '',
          properties: toDots({
            ...(profile?.properties ?? {}),
            ...(item.properties ?? {}),
          }),
          project_id: item.project_id ?? profile?.project_id ?? '',
          created_at: item.created_at ?? profile?.created_at ?? '',
          is_external: item.is_external,
        };
      })
      .flatMap((item) => (item ? [item] : []));
  }

  private async updateRedisCache(values: IClickhouseProfile[]): Promise<void> {
    const redisCache = getRedisCache();
    const multi = redisCache.multi();
    values.forEach((value) => {
      multi.setex(
        `profile:${value.project_id}:${value.id}`,
        60 * 30, // 30 minutes
        JSON.stringify(value),
      );
    });
    await multi.exec();
  }
}
