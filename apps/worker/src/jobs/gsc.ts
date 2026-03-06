import { db, syncGscData } from '@openpanel/db';
import { gscQueue } from '@openpanel/queue';
import type { GscQueuePayload } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { logger } from '../utils/logger';

const BACKFILL_MONTHS = 6;
const CHUNK_DAYS = 14;

export async function gscJob(job: Job<GscQueuePayload>) {
  switch (job.data.type) {
    case 'gscProjectSync':
      return gscProjectSyncJob(job.data.payload.projectId);
    case 'gscProjectBackfill':
      return gscProjectBackfillJob(job.data.payload.projectId);
  }
}

async function gscProjectSyncJob(projectId: string) {
  const conn = await db.gscConnection.findUnique({ where: { projectId } });
  if (!conn?.siteUrl) {
    logger.warn('GSC sync skipped: no connection or siteUrl', { projectId });
    return;
  }

  try {
    // Sync rolling 3-day window (GSC data can arrive late)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1); // yesterday
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 2); // 3 days total

    await syncGscData(projectId, startDate, endDate);

    await db.gscConnection.update({
      where: { projectId },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
      },
    });
    logger.info('GSC sync completed', { projectId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.gscConnection.update({
      where: { projectId },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: 'error',
        lastSyncError: message,
      },
    });
    logger.error('GSC sync failed', { projectId, error });
    throw error;
  }
}

async function gscProjectBackfillJob(projectId: string) {
  const conn = await db.gscConnection.findUnique({ where: { projectId } });
  if (!conn?.siteUrl) {
    logger.warn('GSC backfill skipped: no connection or siteUrl', { projectId });
    return;
  }

  await db.gscConnection.update({
    where: { projectId },
    data: { backfillStatus: 'running' },
  });

  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1); // yesterday

    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - BACKFILL_MONTHS);

    // Process in chunks to avoid timeouts and respect API limits
    let chunkEnd = new Date(endDate);
    while (chunkEnd > startDate) {
      const chunkStart = new Date(chunkEnd);
      chunkStart.setDate(chunkStart.getDate() - CHUNK_DAYS + 1);
      if (chunkStart < startDate) {
        chunkStart.setTime(startDate.getTime());
      }

      logger.info('GSC backfill chunk', {
        projectId,
        from: chunkStart.toISOString().slice(0, 10),
        to: chunkEnd.toISOString().slice(0, 10),
      });

      await syncGscData(projectId, chunkStart, chunkEnd);

      chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() - 1);
    }

    await db.gscConnection.update({
      where: { projectId },
      data: {
        backfillStatus: 'completed',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
      },
    });
    logger.info('GSC backfill completed', { projectId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.gscConnection.update({
      where: { projectId },
      data: {
        backfillStatus: 'failed',
        lastSyncStatus: 'error',
        lastSyncError: message,
      },
    });
    logger.error('GSC backfill failed', { projectId, error });
    throw error;
  }
}

export async function gscSyncAllJob() {
  const connections = await db.gscConnection.findMany({
    where: {
      siteUrl: { not: '' },
    },
    select: { projectId: true },
  });

  logger.info('GSC nightly sync: enqueuing projects', {
    count: connections.length,
  });

  for (const conn of connections) {
    await gscQueue.add('gscProjectSync', {
      type: 'gscProjectSync',
      payload: { projectId: conn.projectId },
    });
  }
}
