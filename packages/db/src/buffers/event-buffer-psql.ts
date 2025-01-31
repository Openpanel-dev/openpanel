import { setSuperJson } from '@openpanel/common';
import { generateSecureId } from '@openpanel/common/server/id';
import { type ILogger as Logger, createLogger } from '@openpanel/logger';
import { getRedisCache, getRedisPub, runEvery } from '@openpanel/redis';
import { Prisma } from '@prisma/client';
import { ch } from '../clickhouse-client';
import { type EventBuffer as IPrismaEventBuffer, db } from '../prisma-client';
import {
  type IClickhouseEvent,
  type IServiceEvent,
  transformEvent,
} from '../services/event.service';

export class EventBuffer {
  private name = 'event';
  private logger: Logger;
  private lockKey = `lock:${this.name}`;
  private lockTimeout = 60;
  private daysToKeep = 2;
  private batchSize = 1000;

  constructor() {
    this.logger = createLogger({ name: this.name });
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

      // TODO: UNCOMMENT THIS!!!
      // this.publishEvent('event:received', event);
      // if (event.profile_id) {
      //   getRedisCache().set(
      //     `live:event:${event.project_id}:${event.profile_id}`,
      //     '',
      //     'EX',
      //     60 * 5,
      //   );
      // }
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
    const lockId = generateSecureId('lock');
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
        await this.tryCleanup();
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
    const eventsToProcess = await db.$queryRaw<IPrismaEventBuffer[]>`
      WITH has_2_special AS (
        SELECT "sessionId"
          FROM event_buffer
          WHERE "processedAt" IS NULL
            AND name IN ('screen_view', 'session_start', 'session_end')
          GROUP BY "sessionId"
          HAVING COUNT(*) >= 2
      )
      SELECT *
      FROM event_buffer e
      WHERE e."processedAt" IS NULL
        AND (
          -- 1) if the event name is NOT in the special set
          e.name NOT IN ('screen_view', 'session_start', 'session_end')
          OR
          -- 2) if the event name IS in the special set AND
          --    the session has >= 2 such unprocessed events
          (
            e.name IN ('screen_view', 'session_start', 'session_end')
            AND e."sessionId" IN (SELECT "sessionId" FROM has_2_special)
          )
        )
      ORDER BY e."createdAt" ASC  -- or e.id, whichever "oldest first" logic you use
      LIMIT ${this.batchSize}
    `;

    const toInsert = eventsToProcess.reduce<IPrismaEventBuffer[]>(
      (acc, event, index, list) => {
        if (event.name === 'screen_view') {
          const nextScreenView = list.find(
            (e, eIndex) =>
              (e.name === 'screen_view' || e.name === 'session_end') &&
              e.sessionId === event.sessionId &&
              eIndex > index,
          );

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
        }

        acc.push(event);

        return acc;
      },
      [],
    );

    if (toInsert.length > 0) {
      await ch.insert({
        table: 'events',
        values: toInsert.map((e) => e.payload),
        format: 'JSONEachRow',
      });

      for (const event of toInsert) {
        this.publishEvent('event:saved', event.payload);
      }

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

      this.logger.info('Processed events', {
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
