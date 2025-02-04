import { getSafeJson, setSuperJson } from '@openpanel/common';
import { getRedisCache, getRedisPub, runEvery } from '@openpanel/redis';
import { Prisma } from '@prisma/client';
import { ch } from '../clickhouse-client';
import { type EventBuffer as IPrismaEventBuffer, db } from '../prisma-client';
import {
  type IClickhouseEvent,
  type IServiceEvent,
  transformEvent,
} from '../services/event.service';
import { BaseBuffer } from './base-buffer';

export class EventBuffer extends BaseBuffer {
  private daysToKeep = process.env.EVENT_BUFFER_DAYS_TO_KEEP
    ? Number.parseInt(process.env.EVENT_BUFFER_DAYS_TO_KEEP, 10)
    : 3;
  private batchSize = process.env.EVENT_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_BATCH_SIZE, 10)
    : 2000;
  private chunkSize = process.env.EVENT_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_CHUNK_SIZE, 10)
    : 1000;

  constructor() {
    super({
      name: 'event',
      onFlush: async () => {
        await this.processBuffer();
        await this.tryCleanup();
      },
    });
  }

  async add(event: IClickhouseEvent) {
    try {
      await db.eventBuffer.create({
        data: {
          projectId: event.project_id,
          eventId: event.id,
          name: event.name,
          profileId: event.profile_id || null,
          sessionId: event.session_id || null,
          payload: event,
        },
      });

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

      if (!process.env.TEST_NEW_BUFFER) {
        this.publishEvent('event:received', event);
        if (event.profile_id) {
          getRedisCache().set(
            `live:event:${event.project_id}:${event.profile_id}`,
            '',
            'EX',
            60 * 5,
          );
        }
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          this.logger.warn('Duplicate event ignored', { eventId: event.id });
          return;
        }
      }
      this.logger.error('Failed to add event', { error });
    }
  }

  private async publishEvent(channel: string, event: IClickhouseEvent) {
    try {
      await getRedisPub().publish(
        channel,
        setSuperJson(
          transformEvent(event) as unknown as Record<string, unknown>,
        ),
      );
    } catch (error) {
      this.logger.warn('Failed to publish event', { error });
    }
  }

  async processBuffer() {
    let now = performance.now();
    const timer: Record<string, number | undefined> = {
      fetchUnprocessedEvents: undefined,
      transformEvents: undefined,
      insertToClickhouse: undefined,
      markAsProcessed: undefined,
    };
    const eventsToProcess = await db.$queryRaw<IPrismaEventBuffer[]>`
      WITH has_more_than_2_events AS (
        SELECT "sessionId"
          FROM event_buffer
          WHERE "processedAt" IS NULL
          GROUP BY "sessionId"
          HAVING COUNT(*) >= 2
      )
      SELECT *
      FROM event_buffer e
      WHERE e."processedAt" IS NULL
        AND (
          -- 1) all events except screen_view
          e.name != 'screen_view'
          OR
          -- 2) if the session has >= 2 such unprocessed events
          e."sessionId" IN (SELECT "sessionId" FROM has_more_than_2_events)
        )
      ORDER BY e."createdAt" ASC
      LIMIT ${this.batchSize}
    `;

    timer.fetchUnprocessedEvents = performance.now() - now;
    now = performance.now();

    const toInsert = eventsToProcess.reduce<IPrismaEventBuffer[]>(
      (acc, event, index, list) => {
        // SCREEN VIEW
        if (event.name === 'screen_view') {
          const nextScreenView = list
            .slice(index + 1)
            .find(
              (e) =>
                (e.name === 'screen_view' || e.name === 'session_end') &&
                e.sessionId === event.sessionId,
            );

          // Calculate duration
          if (nextScreenView && nextScreenView.name === 'screen_view') {
            event.payload.duration =
              new Date(nextScreenView.createdAt).getTime() -
              new Date(event.createdAt).getTime();
          }

          // if there is no more screen views nor session_end,
          // we don't want to insert this event into clickhouse
          if (!nextScreenView) {
            return acc;
          }
        } else {
          // OTHER EVENTS
          const currentScreenView = list
            .slice(0, index)
            .findLast(
              (e) =>
                e.name === 'screen_view' && e.sessionId === event.sessionId,
            );

          if (currentScreenView) {
            // Get path related info from the current screen view
            event.payload.path = currentScreenView.payload.path;
            event.payload.origin = currentScreenView.payload.origin;
          }
        }

        acc.push(event);

        return acc;
      },
      [],
    );

    timer.transformEvents = performance.now() - now;
    now = performance.now();

    if (toInsert.length > 0) {
      const events = toInsert.map((e) => e.payload);
      for (const chunk of this.chunks(events, this.chunkSize)) {
        await ch.insert({
          table: 'events',
          values: chunk,
          format: 'JSONEachRow',
        });
      }

      timer.insertToClickhouse = performance.now() - now;
      now = performance.now();

      for (const event of toInsert) {
        this.publishEvent('event:saved', event.payload);
      }

      timer.markAsProcessed = performance.now() - now;
      now = performance.now();

      await db.eventBuffer.updateMany({
        where: {
          id: {
            in: toInsert.map((e) => e.id),
          },
        },
        data: {
          processedAt: new Date(),
        },
      });

      timer.markAsProcessed = performance.now() - now;

      this.logger.info('Processed events', {
        inserted: toInsert.length,
        processed: eventsToProcess.length,
        timer,
      });
    }
  }

  async tryCleanup() {
    try {
      await runEvery({
        interval: 60 * 5, // 5 minutes
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

    const deleted = await db.$executeRaw`
      DELETE FROM event_buffer
      WHERE 
      -- 1) if the event has been processed
      --    and session is completed or has no session
      (
        "processedAt" IS NOT NULL
        AND (
          "sessionId" IN (SELECT "sessionId" FROM event_buffer WHERE name = 'session_end') 
          OR "sessionId" IS NULL
        )
      )
      -- 2) if the event is stalled for X days
      OR "createdAt" < ${olderThan}
    `;

    this.logger.info('Cleaned up old events', { deleted });
  }

  public async getLastScreenView({
    projectId,
    profileId,
  }: {
    projectId: string;
    profileId: string;
  }): Promise<IServiceEvent | null> {
    // const event = await db.$primary().eventBuffer.findFirst({
    //   where: {
    //     projectId,
    //     profileId,
    //     name: 'screen_view',
    //   },
    //   orderBy: { createdAt: 'desc' },
    //   select: {
    //     payload: true,
    //   },
    // });

    // if (event) {
    //   return transformEvent(event.payload);
    // }

    // return null;
    const event = await getRedisCache().get(
      this.getLastEventKey({ projectId, profileId }),
    );

    if (event) {
      const parsed = getSafeJson<IClickhouseEvent>(event);
      if (parsed) {
        return transformEvent(parsed);
      }
    }
    return null;
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
}
