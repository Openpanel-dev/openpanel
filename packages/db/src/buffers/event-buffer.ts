import { groupBy, omit } from 'ramda';
import SuperJSON from 'superjson';

import { deepMergeObjects, getSafeJson } from '@openpanel/common';
import { getRedisCache, getRedisPub } from '@openpanel/redis';

import {
  TABLE_NAMES,
  ch,
  convertClickhouseDateToJs,
} from '../clickhouse-client';
import { transformEvent } from '../services/event.service';
import type {
  IClickhouseEvent,
  IServiceEvent,
} from '../services/event.service';
import type { Find, FindMany } from './buffer';
import { RedisBuffer } from './buffer';

const STALLED_QUEUE_TIMEOUT = 1000 * 60 * 60 * 24;

type BufferType = IClickhouseEvent;
export class EventBuffer extends RedisBuffer<BufferType> {
  constructor() {
    super(TABLE_NAMES.events, null);
  }

  getLastEventKey({
    projectId,
    profileId,
  }: {
    projectId: string;
    profileId: string;
  }) {
    return `session:last_screen_view:${projectId}:${profileId}`;
  }

  public async getLastScreenView({
    projectId,
    profileId,
  }: {
    projectId: string;
    profileId: string;
  }): Promise<IServiceEvent | null> {
    const event = await getRedisCache().get(
      this.getLastEventKey({ projectId, profileId }),
    );

    if (event) {
      const parsed = getSafeJson<BufferType>(event);
      if (parsed) {
        return transformEvent(parsed);
      }
    }
    return null;
  }

  public async add(event: BufferType) {
    await super.add(event);
    if (event.name === 'screen_view') {
      await getRedisCache().set(
        this.getLastEventKey({
          projectId: event.project_id,
          profileId: event.profile_id,
        }),
        JSON.stringify(event),
        'EX',
        60 * 31,
      );
    }
  }

  public onAdd(event: BufferType) {
    getRedisPub().publish(
      'event:received',
      SuperJSON.stringify(transformEvent(event)),
    );
    if (event.profile_id) {
      getRedisCache().set(
        `live:event:${event.project_id}:${event.profile_id}`,
        '',
        'EX',
        60 * 5,
      );
    }
  }

  public onInsert(items: BufferType[]) {
    for (const event of items) {
      getRedisPub().publish(
        'event:saved',
        SuperJSON.stringify(transformEvent(event)),
      );
    }
  }

  protected async processItems(
    queue: BufferType[],
  ): Promise<{ toInsert: BufferType[]; toKeep: BufferType[] }> {
    const toInsert: BufferType[] = [];
    const toStalled: BufferType[] = [];

    // Sort data by created_at
    // oldest first
    queue.sort(sortOldestFirst);

    // All events thats not a screen_view can be sent to clickhouse
    // We only need screen_views since we want to calculate the duration of each screen
    // To do this we need a minimum of 2 screen_views
    queue
      .filter((item) => item.name !== 'screen_view' || item.device === 'server')
      .forEach((item, index) => {
        // Find the last event with data and merge it with the current event
        // We use profile_id here since this property can be set from backend as well
        const lastEventWithData = queue
          .slice(0, index)
          .findLast((lastEvent) => {
            return (
              lastEvent.project_id === item.project_id &&
              lastEvent.profile_id === item.profile_id &&
              lastEvent.path !== '' &&
              lastEvent.name === 'screen_view'
            );
          });

        const event = deepMergeObjects<BufferType>(
          omit(['properties', 'duration'], lastEventWithData || {}),
          item,
        );

        if (!event.properties) {
          event.properties = {};
        }

        if (lastEventWithData) {
          event.properties.__properties_from = lastEventWithData.id;
        }

        return toInsert.push(event);
      });

    // Group screen_view events by session_id
    const grouped = groupBy(
      (item) => item.session_id,
      queue.filter(
        (item) => item.name === 'screen_view' && item.device !== 'server',
      ),
    );

    // Iterate over each group
    for (const [sessionId, screenViews] of Object.entries(grouped)) {
      if (sessionId === '' || !sessionId) {
        continue;
      }

      // If there is only one screen_view event we can send it back to redis since we can't calculate the duration
      const hasSessionEnd = queue.find(
        (item) => item.name === 'session_end' && item.session_id === sessionId,
      );

      screenViews
        ?.slice()
        .sort(sortOldestFirst)
        .forEach((item, index) => {
          const nextScreenView = screenViews[index + 1];
          // if nextScreenView does not exists we can't calculate the duration (last event in session)
          if (nextScreenView) {
            const duration =
              new Date(nextScreenView.created_at).getTime() -
              new Date(item.created_at).getTime();
            const event = {
              ...item,
              properties: {
                ...(item?.properties || {}),
                __duration_from: nextScreenView.id,
              },
              duration,
            };
            toInsert.push(event);
          } else if (hasSessionEnd) {
            // push last event in session if we have a session_end event
            toInsert.push(item);
          }
        });
    } // for of end

    // Check if we have any events that has been in the queue for more than 24 hour
    // This should not theoretically happen but if it does we should move them to stalled
    queue.forEach((item) => {
      if (
        !toInsert.find((i) => i.id === item.id) &&
        convertClickhouseDateToJs(item.created_at).getTime() <
          new Date().getTime() - STALLED_QUEUE_TIMEOUT
      ) {
        toStalled.push(item);
      }
    });

    if (toStalled.length > 0) {
      try {
        this.logger.info(`Pushing to stalled queue (${toStalled.length})`, {
          items: toStalled,
          count: toStalled.length,
        });
        await getRedisCache().rpush(
          this.getKey('stalled'),
          ...toStalled.map((item) => JSON.stringify(item)),
        );
      } catch (error) {
        toStalled.length = 0;
        this.logger.error('Failed to push to stalled queue', { error });
      }
    }

    return {
      toInsert,
      toKeep: queue.filter((item) => {
        const willBeInserted = toInsert.find((i) => i.id === item.id);
        const willBeStalled = toStalled.find((i) => i.id === item.id);
        return willBeInserted === undefined && willBeStalled === undefined;
      }),
    };
  }

  protected async insertIntoDB(items: BufferType[]): Promise<void> {
    await ch.insert({
      table: TABLE_NAMES.events,
      values: items,
      format: 'JSONEachRow',
    });
  }

  public findMany: FindMany<IClickhouseEvent, IServiceEvent> = async (
    callback,
  ) => {
    if (await this.waitForReleasedLock()) {
      return this.getQueue()
        .then((queue) => {
          return queue.filter(callback).map(transformEvent);
        })
        .catch(() => {
          return [];
        });
    }
    return [];
  };

  public find: Find<IClickhouseEvent, IServiceEvent> = async (callback) => {
    if (await this.waitForReleasedLock()) {
      return this.getQueue(-1)
        .then((queue) => {
          const match = queue.find(callback);
          return match ? transformEvent(match) : null;
        })
        .catch(() => {
          return null;
        });
    }
    return null;
  };
}

const sortOldestFirst = (a: IClickhouseEvent, b: IClickhouseEvent) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
