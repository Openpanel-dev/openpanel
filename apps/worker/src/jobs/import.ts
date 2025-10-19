import {
  type IClickhouseEvent,
  type Prisma,
  db,
  formatClickhouseDate,
} from '@openpanel/db';
import {
  type ImportSteps,
  backfillSessionsToProduction,
  createSessionsStartEndEvents,
  generateSessionIds,
  getImportDateBounds,
  getImportProgress,
  insertImportBatch,
  markImportComplete,
  moveImportsToProduction,
  updateImportStatus,
} from '@openpanel/db/src/services/import.service';
import { MixpanelProvider, UmamiProvider } from '@openpanel/importer';
import type { ILogger } from '@openpanel/logger';
import type { ImportQueuePayload } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { logger } from '../utils/logger';

const BATCH_SIZE = 50_000;

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
    config: record.config,
  });

  type ValidStep = Exclude<ImportSteps, 'failed' | 'completed'>;
  const steps: Record<ValidStep, number> = {
    loading: 0,
    generating_session_ids: 1,
    creating_sessions: 2,
    moving: 3,
    backfilling_sessions: 4,
  };

  jobLogger.info('Starting import job');
  const providerInstance = createProvider(record, jobLogger);

  try {
    // Check if this is a resume operation
    const isNewImport = record.currentStep === null;

    if (isNewImport) {
      await updateImportStatus(jobLogger, job, importId, {
        step: 'loading',
      });
    } else {
      jobLogger.info('Resuming import from previous state', {
        currentStep: record.currentStep,
        currentBatch: record.currentBatch,
      });
    }

    // Try to get a precomputed total for better progress reporting
    const totalEvents = await providerInstance
      .getTotalEventsCount()
      .catch(() => -1);
    let processedEvents = record.processedEvents;

    const resumeLoadingFrom =
      (record.currentStep === 'loading' && record.currentBatch) || undefined;

    const resumeGeneratingSessionIdsFrom =
      (record.currentStep === 'generating_session_ids' &&
        record.currentBatch) ||
      undefined;

    const resumeCreatingSessionsFrom =
      (record.currentStep === 'creating_sessions' && record.currentBatch) ||
      undefined;

    const resumeMovingFrom =
      (record.currentStep === 'moving' && record.currentBatch) || undefined;

    const resumeBackfillingSessionsFrom =
      (record.currentStep === 'backfilling_sessions' && record.currentBatch) ||
      undefined;

    const shouldRunStep = (step: ValidStep) => {
      if (isNewImport) {
        return true;
      }

      const currentStepIndex = steps[step];
      return currentStepIndex > steps[record.currentStep as ValidStep];
    };

    async function whileBounds(
      from: string | undefined,
      callback: (from: string, to: string) => Promise<void>,
    ) {
      const bounds = await getImportDateBounds(importId, from);
      if (bounds.min && bounds.max) {
        const start = new Date(bounds.min);
        const end = new Date(bounds.max);
        let cursor = new Date(start);
        while (cursor < end) {
          const next = new Date(cursor);
          next.setDate(next.getDate() + 1);
          await callback(
            formatClickhouseDate(cursor, true),
            formatClickhouseDate(next, true),
          );
          cursor = next;
        }
      }
    }

    // Phase 1: Fetch & Transform - Process events in batches
    if (shouldRunStep('loading')) {
      const eventBatch: any = [];
      for await (const rawEvent of providerInstance.parseSource(
        resumeLoadingFrom,
      )) {
        // Validate event
        if (
          !providerInstance.validate(
            // @ts-expect-error
            rawEvent,
          )
        ) {
          jobLogger.warn('Skipping invalid event', { rawEvent });
          continue;
        }

        eventBatch.push(rawEvent);

        // Process batch when it reaches the batch size
        if (eventBatch.length >= BATCH_SIZE) {
          jobLogger.info('Processing batch', { batchSize: eventBatch.length });

          const transformedEvents: IClickhouseEvent[] = eventBatch.map(
            (
              // @ts-expect-error
              event,
            ) => providerInstance!.transformEvent(event),
          );

          await insertImportBatch(transformedEvents, importId);

          processedEvents += eventBatch.length;
          eventBatch.length = 0;

          const createdAt = new Date(transformedEvents[0]?.created_at || '')
            .toISOString()
            .split('T')[0];

          await updateImportStatus(jobLogger, job, importId, {
            step: 'loading',
            batch: createdAt,
            totalEvents,
            processedEvents,
          });
        }
      }

      // Process remaining events in the last batch
      if (eventBatch.length > 0) {
        const transformedEvents = eventBatch.map(
          (
            // @ts-expect-error
            event,
          ) => providerInstance!.transformEvent(event),
        );

        await insertImportBatch(transformedEvents, importId);

        processedEvents += eventBatch.length;
        eventBatch.length = 0;

        const createdAt = new Date(transformedEvents[0]?.created_at || '')
          .toISOString()
          .split('T')[0];

        await updateImportStatus(jobLogger, job, importId, {
          step: 'loading',
          batch: createdAt,
        });
      }
    }

    // Phase 2: Generate session IDs if provider requires it
    if (
      shouldRunStep('generating_session_ids') &&
      providerInstance.shouldGenerateSessionIds()
    ) {
      await whileBounds(resumeGeneratingSessionIdsFrom, async (from) => {
        console.log('Generating session IDs', { from });
        await generateSessionIds(importId, from);
        await updateImportStatus(jobLogger, job, importId, {
          step: 'generating_session_ids',
          batch: from,
        });
      });

      jobLogger.info('Session ID generation complete');
    }

    // Phase 3-5: Process in daily batches for robustness

    if (shouldRunStep('creating_sessions')) {
      await whileBounds(resumeCreatingSessionsFrom, async (from) => {
        await createSessionsStartEndEvents(importId, from);
        await updateImportStatus(jobLogger, job, importId, {
          step: 'creating_sessions',
          batch: from,
        });
      });
    }

    if (shouldRunStep('moving')) {
      await whileBounds(resumeMovingFrom, async (from) => {
        await moveImportsToProduction(importId, from);
        await updateImportStatus(jobLogger, job, importId, {
          step: 'moving',
          batch: from,
        });
      });
    }

    if (shouldRunStep('backfilling_sessions')) {
      await whileBounds(resumeBackfillingSessionsFrom, async (from) => {
        await backfillSessionsToProduction(importId, from);
        await updateImportStatus(jobLogger, job, importId, {
          step: 'backfilling_sessions',
          batch: from,
        });
      });
    }

    await markImportComplete(importId);
    await updateImportStatus(jobLogger, job, importId, {
      step: 'completed',
    });
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
      await updateImportStatus(jobLogger, job, importId, {
        step: 'failed',
        errorMessage: errorMsg,
      });
      jobLogger.warn('Import marked as failed', { error: errorMsg });
    } catch (markError) {
      jobLogger.error('Failed to mark import as failed', { error, markError });
    }

    throw error;
  }
}

function createProvider(
  record: Prisma.ImportGetPayload<{ include: { project: true } }>,
  jobLogger: ILogger,
) {
  const config = record.config;
  switch (config.provider) {
    case 'umami':
      return new UmamiProvider(record.projectId, config, jobLogger);
    case 'mixpanel':
      return new MixpanelProvider(record.projectId, config, jobLogger);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
