import { groupBy } from 'ramda';
import SuperJSON from 'superjson';

import { deepMergeObjects } from '@openpanel/common';
import { getRedisCache, getRedisPub } from '@openpanel/redis';

import { ch, TABLE_NAMES } from '../clickhouse-client';
import { transformEvent } from '../services/event.service';
import type {
  IClickhouseEvent,
  IServiceEvent,
} from '../services/event.service';
import type {
  Find,
  FindMany,
  OnCompleted,
  OnInsert,
  ProcessQueue,
  QueueItem,
} from './buffer';
import { RedisBuffer } from './buffer';

const sortOldestFirst = (
  a: QueueItem<IClickhouseEvent>,
  b: QueueItem<IClickhouseEvent>
) =>
  new Date(a.event.created_at).getTime() -
  new Date(b.event.created_at).getTime();

export class EventBuffer extends RedisBuffer<IClickhouseEvent> {
  constructor() {
    super({
      table: TABLE_NAMES.events,
      redis: getRedisCache(),
    });
  }

  public onInsert?: OnInsert<IClickhouseEvent> | undefined = (event) => {
    getRedisPub().publish(
      'event:received',
      SuperJSON.stringify(transformEvent(event))
    );
    if (event.profile_id) {
      this.redis.set(
        `live:event:${event.project_id}:${event.profile_id}`,
        '',
        'EX',
        60 * 5
      );
    }
  };

  public onCompleted?: OnCompleted<IClickhouseEvent> | undefined = (
    savedEvents
  ) => {
    for (const event of savedEvents) {
      getRedisPub().publish(
        'event:saved',
        SuperJSON.stringify(transformEvent(event))
      );
    }

    return savedEvents.map((event) => event.id);
  };

  public processQueue: ProcessQueue<IClickhouseEvent> = async (queue) => {
    const itemsToClickhouse = new Set<QueueItem<IClickhouseEvent>>();
    const itemsToStalled = new Set<QueueItem<IClickhouseEvent>>();

    // Sort data by created_at
    // oldest first
    queue.sort(sortOldestFirst);

    // All events thats not a screen_view can be sent to clickhouse
    // We only need screen_views since we want to calculate the duration of each screen
    // To do this we need a minimum of 2 screen_views
    queue
      .filter(
        (item) =>
          item.event.name !== 'screen_view' || item.event.device === 'server'
      )
      .forEach((item) => {
        // Find the last event with data and merge it with the current event
        // We use profile_id here since this property can be set from backend as well
        const lastEventWithData = queue
          .slice(0, item.index)
          .findLast((lastEvent) => {
            return (
              lastEvent.event.project_id === item.event.project_id &&
              lastEvent.event.profile_id === item.event.profile_id &&
              lastEvent.event.path !== ''
            );
          });

        const event = deepMergeObjects<IClickhouseEvent>(
          lastEventWithData?.event || {},
          item.event
        );

        if (lastEventWithData) {
          event.properties.__properties_from = lastEventWithData.event.id;
        }

        return itemsToClickhouse.add({
          ...item,
          event,
        });
      });

    // Group screen_view events by session_id
    const grouped = groupBy(
      (item) => item.event.session_id,
      queue.filter(
        (item) =>
          item.event.name === 'screen_view' && item.event.device !== 'server'
      )
    );

    // Iterate over each group
    for (const [sessionId, screenViews] of Object.entries(grouped)) {
      if (sessionId === '' || !sessionId) {
        continue;
      }

      // If there is only one screen_view event we can send it back to redis since we can't calculate the duration
      const hasSessionEnd = queue.find(
        (item) =>
          item.event.name === 'session_end' &&
          item.event.session_id === sessionId
      );

      screenViews
        ?.slice()
        .sort(sortOldestFirst)
        .forEach((item, index) => {
          const nextScreenView = screenViews[index + 1];
          // if nextScreenView does not exists we can't calculate the duration (last event in session)
          if (nextScreenView) {
            const duration =
              new Date(nextScreenView.event.created_at).getTime() -
              new Date(item.event.created_at).getTime();
            const event = {
              ...item.event,
              duration,
            };
            event.properties.__duration_from = nextScreenView.event.id;
            itemsToClickhouse.add({
              ...item,
              event,
            });
            // push last event in session if we have a session_end event
          } else if (hasSessionEnd) {
            itemsToClickhouse.add(item);
          }
        });
    } // for of end

    // Check if we have any events that has been in the queue for more than 24 hour
    // This should not theoretically happen but if it does we should move them to stalled
    queue.forEach((item) => {
      if (
        !itemsToClickhouse.has(item) &&
        new Date(item.event.created_at).getTime() <
          new Date().getTime() - 1000 * 60 * 60 * 24
      ) {
        itemsToStalled.add(item);
      }
    });

    if (itemsToStalled.size > 0) {
      const multi = this.redis.multi();
      for (const item of itemsToStalled) {
        multi.rpush(this.getKey('stalled'), JSON.stringify(item.event));
      }
      await multi.exec();
    }

    await ch.insert({
      table: TABLE_NAMES.events,
      values: Array.from(itemsToClickhouse).map((item) => item.event),
      format: 'JSONEachRow',
    });

    return [
      ...Array.from(itemsToClickhouse).map((item) => item.index),
      ...Array.from(itemsToStalled).map((item) => item.index),
    ];
  };

  public findMany: FindMany<IClickhouseEvent, IServiceEvent> = async (
    callback
  ) => {
    return this.getQueue(-1)
      .then((queue) => {
        return queue.filter(callback).map((item) => transformEvent(item.event));
      })
      .catch(() => {
        return [];
      });
  };

  public find: Find<IClickhouseEvent, IServiceEvent> = async (callback) => {
    return this.getQueue(-1)
      .then((queue) => {
        const match = queue.find(callback);
        return match ? transformEvent(match.event) : null;
      })
      .catch(() => {
        return null;
      });
  };
}
