import { mergeDeepRight } from 'ramda';

import { toDots } from '@openpanel/common';
import { getRedisCache } from '@openpanel/redis';

import { TABLE_NAMES, ch, chQuery } from '../clickhouse-client';
import type {
  IClickhouseProfile,
  IServiceProfile,
} from '../services/profile.service';
import { transformProfile } from '../services/profile.service';
import type {
  Find,
  FindMany,
  OnCompleted,
  OnInsert,
  ProcessQueue,
  QueueItem,
} from './buffer';
import { RedisBuffer } from './buffer';

export class ProfileBuffer extends RedisBuffer<IClickhouseProfile> {
  constructor() {
    super({
      table: TABLE_NAMES.profiles,
      batchSize: 100,
      disableAutoFlush: true,
    });
  }

  public onInsert?: OnInsert<IClickhouseProfile> | undefined;
  public onCompleted?: OnCompleted<IClickhouseProfile> | undefined;

  public processQueue: ProcessQueue<IClickhouseProfile> = async (queue) => {
    const cleanedQueue = this.combineQueueItems(queue);
    const redisProfiles = await this.getCachedProfiles(cleanedQueue);
    const dbProfiles = await this.fetchDbProfiles(
      cleanedQueue.filter((_, index) => !redisProfiles[index]),
    );

    const values = this.createProfileValues(
      cleanedQueue,
      redisProfiles,
      dbProfiles,
    );

    if (values.length > 0) {
      await this.updateRedisCache(values);
      await this.insertIntoClickhouse(values);
    }

    return queue.map((item) => item.index);
  };

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

  private combineQueueItems(
    queue: QueueItem<IClickhouseProfile>[],
  ): QueueItem<IClickhouseProfile>[] {
    const itemsToClickhouse = new Map<string, QueueItem<IClickhouseProfile>>();

    queue.forEach((item) => {
      const key = item.event.project_id + item.event.id;
      const existing = itemsToClickhouse.get(key);
      itemsToClickhouse.set(key, mergeDeepRight(existing ?? {}, item));
    });

    return Array.from(itemsToClickhouse.values());
  }

  private async getCachedProfiles(
    cleanedQueue: QueueItem<IClickhouseProfile>[],
  ): Promise<(IClickhouseProfile | null)[]> {
    const redisCache = getRedisCache();
    const keys = cleanedQueue.map(
      (item) => `profile:${item.event.project_id}:${item.event.id}`,
    );
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
    cleanedQueue: QueueItem<IClickhouseProfile>[],
  ): Promise<IClickhouseProfile[]> {
    if (cleanedQueue.length === 0) {
      return [];
    }

    return await chQuery<IClickhouseProfile>(
      `SELECT 
          *
        FROM ${TABLE_NAMES.profiles}
        WHERE 
            (id, project_id) IN (${cleanedQueue.map((item) => `('${item.event.id}', '${item.event.project_id}')`).join(',')})
        ORDER BY
            created_at DESC`,
    );
  }

  private createProfileValues(
    cleanedQueue: QueueItem<IClickhouseProfile>[],
    redisProfiles: (IClickhouseProfile | null)[],
    dbProfiles: IClickhouseProfile[],
  ): IClickhouseProfile[] {
    return cleanedQueue
      .map((item, index) => {
        const cachedProfile = redisProfiles[index];
        const dbProfile = dbProfiles.find(
          (p) =>
            p.id === item.event.id && p.project_id === item.event.project_id,
        );
        const profile = cachedProfile || dbProfile;

        if (
          profile &&
          this.matchPartialObject(
            profile,
            {
              ...item.event,
              properties: toDots(item.event.properties),
            },
            {
              ignore: ['created_at'],
            },
          )
        ) {
          console.log('Ignoring profile', item.event.id);
          return null;
        }

        return {
          id: item.event.id,
          first_name: item.event.first_name ?? profile?.first_name ?? '',
          last_name: item.event.last_name ?? profile?.last_name ?? '',
          email: item.event.email ?? profile?.email ?? '',
          avatar: item.event.avatar ?? profile?.avatar ?? '',
          properties: toDots({
            ...(profile?.properties ?? {}),
            ...(item.event.properties ?? {}),
          }),
          project_id: item.event.project_id ?? profile?.project_id ?? '',
          created_at: item.event.created_at ?? profile?.created_at ?? '',
          is_external: item.event.is_external,
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

  private async insertIntoClickhouse(
    values: IClickhouseProfile[],
  ): Promise<void> {
    await ch.insert({
      table: TABLE_NAMES.profiles,
      values,
      format: 'JSONEachRow',
    });
  }

  public findMany: FindMany<IClickhouseProfile, IServiceProfile> = async (
    callback,
  ) => {
    return this.getQueue(-1)
      .then((queue) => {
        return queue
          .filter(callback)
          .map((item) => transformProfile(item.event));
      })
      .catch(() => {
        return [];
      });
  };

  public find: Find<IClickhouseProfile, IServiceProfile> = async (callback) => {
    return this.getQueue(-1)
      .then((queue) => {
        const match = queue.find(callback);
        return match ? transformProfile(match.event) : null;
      })
      .catch(() => {
        return null;
      });
  };
}
