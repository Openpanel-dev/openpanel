import { generateId, setSuperJson } from '@openpanel/common';
import { type ILogger as Logger, createLogger } from '@openpanel/logger';
import { getRedisCache, getRedisPub } from '@openpanel/redis';
import { Prisma } from '@prisma/client';
import { ch } from '../clickhouse-client';
import { db } from '../prisma-client';
import {
  type IClickhouseEvent,
  type IServiceEvent,
  transformEvent,
} from '../services/event.service';

export class EventBuffer {
  private logger: Logger;
  private lockKey = 'lock:events';
  private lockTimeout = 60;
  constructor() {
    this.logger = createLogger({ name: 'EventBuffer' });
  }

  async add(event: IClickhouseEvent) {
    try {
      await db.eventBuffer.create({
        data: {
          projectId: event.project_id,
          eventId: event.id,
          name: event.name,
          profileId: event.profile_id,
          sessionId: event.session_id,
          payload: event,
        },
      });

      this.publishEvent('event:received', event);

      if (event.profile_id) {
        getRedisCache().set(
          `live:event:${event.project_id}:${event.profile_id}`,
          '',
          'EX',
          60 * 5,
        );
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

  private async releaseLock(lockId: string): Promise<void> {
    this.logger.debug('Releasing lock...');
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await getRedisCache().eval(script, 1, this.lockKey, lockId);
  }

  async tryFlush() {
    const lockId = generateId();
    const acquired = await getRedisCache().set(
      this.lockKey,
      lockId,
      'EX',
      this.lockTimeout,
      'NX',
    );
    if (acquired === 'OK') {
      try {
        this.logger.info('Acquired lock. Processing buffer...');
        await this.processBuffer();
      } catch (error) {
        this.logger.error('Failed to process buffer', { error });
      } finally {
        await this.releaseLock(lockId);
      }
    } else {
      this.logger.warn('Failed to acquire lock. Skipping flush.');
    }
  }

  async processBuffer() {
    const eventsToProcess = await db.$transaction(async (trx) => {
      // Process all screen_views that have a next event
      const processableViews = await trx.$queryRaw<
        Array<{
          id: string;
          payload: IClickhouseEvent;
          next_event_time: Date;
        }>
      >`
          WITH NextEvents AS (
            SELECT 
              id,
              payload,
              LEAD("createdAt") OVER (
                PARTITION BY "sessionId" 
                ORDER BY "createdAt"
              ) as next_event_time
            FROM event_buffer
            WHERE "name" = 'screen_view'
              AND "processedAt" IS NULL
          )
          SELECT *
          FROM NextEvents
          WHERE next_event_time IS NOT NULL
        `;

      // Find screen_views that are last in their session with session_end
      const lastViews = await trx.$queryRaw<
        Array<{
          id: string;
          payload: IClickhouseEvent;
        }>
      >`
          WITH LastViews AS (
            SELECT e.id, e.payload,
              EXISTS (
                SELECT 1 
                FROM event_buffer se
                WHERE se."name" = 'session_end'
                  AND se."sessionId" = e."sessionId"
                  AND se."createdAt" > e."createdAt"
              ) as has_session_end
            FROM event_buffer e
            WHERE e."name" = 'screen_view'
              AND e."processedAt" IS NULL
              AND NOT EXISTS (
                SELECT 1
                FROM event_buffer next
                WHERE next."sessionId" = e."sessionId"
                  AND next."name" = 'screen_view'
                  AND next."createdAt" > e."createdAt"
              )
          )
          SELECT * FROM LastViews
          WHERE has_session_end = true
        `;

      // Get all other events
      const regularEvents = await trx.eventBuffer.findMany({
        where: {
          processedAt: null,
          name: { not: 'screen_view' },
        },
        orderBy: { createdAt: 'asc' },
      });

      return {
        processableViews,
        lastViews,
        regularEvents,
      };
    });

    const toInsert = [
      ...eventsToProcess.processableViews.map((view) => ({
        ...view.payload,
        duration:
          new Date(view.next_event_time).getTime() -
          new Date(view.payload.created_at).getTime(),
      })),
      ...eventsToProcess.lastViews.map((v) => v.payload),
      ...eventsToProcess.regularEvents.map((e) => e.payload),
    ];

    if (toInsert.length > 0) {
      await ch.insert({
        table: 'events',
        values: toInsert,
        format: 'JSONEachRow',
      });

      for (const event of toInsert) {
        this.publishEvent('event:saved', event);
      }

      await db.eventBuffer.updateMany({
        where: {
          id: {
            in: [
              ...eventsToProcess.processableViews.map((v) => v.id),
              ...eventsToProcess.lastViews.map((v) => v.id),
              ...eventsToProcess.regularEvents.map((e) => e.id),
            ],
          },
        },
        data: {
          processedAt: new Date(),
        },
      });

      this.logger.info('Processed events', {
        count: toInsert.length,
        screenViews:
          eventsToProcess.processableViews.length +
          eventsToProcess.lastViews.length,
        regularEvents: eventsToProcess.regularEvents.length,
      });
    }
  }

  async cleanup() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 2);

    const deleted = await db.eventBuffer.deleteMany({
      where: {
        processedAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    this.logger.info('Cleaned up old events', { deleted: deleted.count });
  }

  public async getLastScreenView({
    projectId,
    profileId,
  }: {
    projectId: string;
    profileId: string;
  }): Promise<IServiceEvent | null> {
    const event = await db.eventBuffer.findFirst({
      where: {
        projectId,
        profileId,
        name: 'screen_view',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (event) {
      return transformEvent(event.payload);
    }

    return null;
  }
}
