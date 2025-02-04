import { runEvery } from '@openpanel/redis';

import { TABLE_NAMES, ch } from '../clickhouse-client';
import { db } from '../prisma-client';
import type { IClickhouseBotEvent } from '../services/event.service';
import { BaseBuffer } from './base-buffer';

export class BotBuffer extends BaseBuffer {
  private batchSize = process.env.BOT_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.BOT_BUFFER_BATCH_SIZE, 10)
    : 1000;

  constructor() {
    super({
      name: 'bot',
      onFlush: async () => {
        await this.processBuffer();
        await this.tryCleanup();
      },
    });
  }

  async add(event: IClickhouseBotEvent) {
    try {
      await db.botEventBuffer.create({
        data: {
          projectId: event.project_id,
          eventId: event.id,
          payload: event,
        },
      });

      // Check if we have enough unprocessed events to trigger a flush
      const unprocessedCount = await db.botEventBuffer.count({
        where: {
          processedAt: null,
        },
      });

      if (unprocessedCount >= this.batchSize && !process.env.TEST_NEW_BUFFER) {
        await this.tryFlush();
      }
    } catch (error) {
      this.logger.error('Failed to add bot event', { error });
    }
  }

  async processBuffer() {
    const eventsToProcess = await db.botEventBuffer.findMany({
      where: {
        processedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: this.batchSize,
    });

    if (eventsToProcess.length > 0) {
      const toInsert = eventsToProcess.map((e) => e.payload);

      await ch.insert({
        table: TABLE_NAMES.events_bots,
        values: toInsert,
        format: 'JSONEachRow',
      });

      await db.botEventBuffer.updateMany({
        where: {
          id: {
            in: eventsToProcess.map((e) => e.id),
          },
        },
        data: {
          processedAt: new Date(),
        },
      });

      this.logger.info('Processed bot events', {
        count: toInsert.length,
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
    const deleted = await db.botEventBuffer.deleteMany({
      where: {
        processedAt: {
          not: null,
        },
      },
    });

    this.logger.info('Cleaned up old bot events', { deleted: deleted.count });
  }
}
