import { type Prisma, db } from '@openpanel/db';
import {
  getImportDateBounds,
  getImportProgress,
  insertImportBatch,
  markImportComplete,
  markImportFailed,
  migrateImportToProduction,
  reconstructSessions,
  updateImportProgress,
} from '@openpanel/db/src/services/import.service';
import { UmamiProvider, type UmamiRawEvent } from '@openpanel/importer';
import type { ImportQueuePayload } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { logger } from '../utils/logger';

const BATCH_SIZE = 5000;

export async function importJob(job: Job<ImportQueuePayload>) {
  const { importId } = job.data.payload;

  const record = await db.import.findUniqueOrThrow({
    where: { id: importId },
    include: {
      project: true,
    },
  });

  const jobLogger = logger.child({
    importId,
  });

  try {
    jobLogger.info('Starting import job');

    // Create provider instance
    const providerInstance = createProvider(record);

    jobLogger.info('Provider instance created');

    let totalEvents = 0;
    let processedEvents = 0;
    let currentBatch = 0;

    // Phase 1: Load & Transform - Process events in batches
    const eventBatch: UmamiRawEvent[] = [];

    for await (const rawEvent of providerInstance.parseSource()) {
      // Validate event
      if (!providerInstance.validate(rawEvent)) {
        jobLogger.warn('Skipping invalid event', { rawEvent });
        continue;
      }

      eventBatch.push(rawEvent);
      totalEvents++;

      // Process batch when it reaches the batch size
      if (eventBatch.length >= BATCH_SIZE) {
        jobLogger.info('Processing batch', { batchSize: eventBatch.length });

        // Transform events
        const transformedEvents = eventBatch.map((event) =>
          providerInstance.transformEvent(event),
        );

        // Phase 2: Insert into staging table
        await insertImportBatch(transformedEvents, importId);

        processedEvents += eventBatch.length;
        currentBatch++;
        eventBatch.length = 0; // Clear array

        // Update job progress in BullMQ and database
        await job.updateProgress({
          totalEvents,
          processedEvents,
          currentBatch,
          totalBatches: Math.ceil(totalEvents / BATCH_SIZE),
        });

        await updateImportProgress(importId, totalEvents, processedEvents);

        jobLogger.info('Batch processed and inserted into staging', {
          batchSize: transformedEvents.length,
          currentBatch,
        });
      }
    }

    // Process remaining events in the last batch
    if (eventBatch.length > 0) {
      jobLogger.info('Processing final batch', {
        batchSize: eventBatch.length,
      });

      const transformedEvents = eventBatch.map((event) =>
        providerInstance.transformEvent(event),
      );

      await insertImportBatch(transformedEvents, importId);
      processedEvents += eventBatch.length;

      // Update final batch progress
      await updateImportProgress(importId, totalEvents, processedEvents);
    }

    jobLogger.info('Phase 1 complete - all events loaded into staging', {
      totalEvents,
      processedEvents,
    });

    // Phase 2b-4: Process in monthly batches for robustness
    const bounds = await getImportDateBounds(importId);
    if (bounds.min && bounds.max) {
      const start = new Date(bounds.min);
      const end = new Date(bounds.max);

      // Normalize to the first day of the month
      let cursor = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
      );
      const hardEnd = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1),
      );
      let monthIndex = 0;
      while (cursor < hardEnd) {
        const next = new Date(
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
        );

        const from = cursor.toISOString().replace('T', ' ').replace('Z', '');
        const to = next.toISOString().replace('T', ' ').replace('Z', '');

        jobLogger.info('Processing monthly batch', { monthIndex, from, to });

        // Stage 3: Session reconstruction for this slice
        await reconstructSessions(importId, from, to);
        jobLogger.info('Session reconstruction batch complete', { monthIndex });

        // Stage 4: Migrate this slice to production
        await migrateImportToProduction(importId, from, to);
        jobLogger.info('Migration batch complete', { monthIndex });

        // Update job progress with batch info
        await job.updateProgress({
          totalEvents,
          processedEvents,
          currentBatch,
          batchWindow: { from, to },
          monthIndex,
        });

        cursor = next;
        monthIndex += 1;
      }
    } else {
      // Fallback single-shot if no bounds
      jobLogger.info(
        'No date bounds found; running single-shot reconstruction/migration',
      );
      await reconstructSessions(importId);
      await migrateImportToProduction(importId);
    }

    // Phase 5: Mark as Complete
    await markImportComplete(importId);
    jobLogger.info('Import marked as complete');

    // Get final progress
    const finalProgress = await getImportProgress(importId);

    jobLogger.info('Import job completed successfully', {
      totalEvents: finalProgress.totalEvents,
      insertedEvents: finalProgress.insertedEvents,
      status: finalProgress.status,
    });

    return {
      success: true,
      totalEvents: finalProgress.totalEvents,
      processedEvents: finalProgress.insertedEvents,
    };
  } catch (error) {
    jobLogger.error('Import job failed', { error });

    // Mark import as failed
    try {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await markImportFailed(importId, errorMsg);
      jobLogger.info('Import marked as failed');
    } catch (markError) {
      jobLogger.error('Failed to mark import as failed', { error: markError });
    }

    throw error;
  }
}

function createProvider(
  record: Prisma.ImportGetPayload<{ include: { project: true } }>,
) {
  switch (record.config.provider) {
    case 'umami':
      return new UmamiProvider(record.projectId, record.config);
    default:
      throw new Error(`Unknown provider: ${record.config.provider}`);
  }
}
