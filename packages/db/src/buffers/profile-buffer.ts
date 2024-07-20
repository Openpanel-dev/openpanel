import { mergeDeepRight } from 'ramda';

import { toDots } from '@openpanel/common';
import { getRedisCache } from '@openpanel/redis';

import { ch, chQuery } from '../clickhouse-client';
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
      redis: getRedisCache(),
      table: 'profiles',
      batchSize: 100,
    });
  }

  public onInsert?: OnInsert<IClickhouseProfile> | undefined;
  public onCompleted?: OnCompleted<IClickhouseProfile> | undefined;

  public processQueue: ProcessQueue<IClickhouseProfile> = async (queue) => {
    const itemsToClickhouse = new Map<string, QueueItem<IClickhouseProfile>>();

    // Combine all writes to the same profile
    queue.forEach((item) => {
      const key = item.event.project_id + item.event.id;
      const existing = itemsToClickhouse.get(key);
      itemsToClickhouse.set(
        item.event.project_id + item.event.id,
        mergeDeepRight(existing ?? {}, item)
      );
    });

    const cleanedQueue = Array.from(itemsToClickhouse.values());

    const profiles = await chQuery<IClickhouseProfile>(
      `SELECT 
          *
        FROM profiles
        WHERE 
            (id, project_id) IN (${cleanedQueue.map((item) => `('${item.event.id}', '${item.event.project_id}')`).join(',')})
        ORDER BY
            created_at DESC`
    );

    await ch.insert({
      table: 'profiles',
      values: cleanedQueue.map((item) => {
        const profile = profiles.find(
          (p) =>
            p.id === item.event.id && p.project_id === item.event.project_id
        );

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
          created_at: new Date(),
          is_external: item.event.is_external,
        };
      }),
      clickhouse_settings: {
        date_time_input_format: 'best_effort',
      },
      format: 'JSONEachRow',
    });
    return queue.map((item) => item.index);
  };

  public findMany: FindMany<IClickhouseProfile, IServiceProfile> = async (
    callback
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
