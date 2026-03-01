import {
  backfillSessionsToProduction,
  cleanupStagingData,
  createSessionsStartEndEvents,
  db,
  generateGapBasedSessionIds,
  getImportDateBounds,
  type IClickhouseEvent,
  type IClickhouseProfile,
  insertImportBatch,
  insertProfilesBatch,
  moveImportsToProduction,
  type Prisma,
  updateImportStatus,
} from '@openpanel/db';
import { MixpanelProvider, UmamiProvider } from '@openpanel/importer';
import type { ILogger } from '@openpanel/logger';
import type { ImportQueuePayload } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { logger } from '../utils/logger';

const BATCH_SIZE = Number.parseInt(process.env.IMPORT_BATCH_SIZE || '5000', 10);

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
}

const PRODUCTION_STEPS = ['moving', 'backfilling_sessions'];

export async function importJob(job: Job<ImportQueuePayload>) {
  const { importId } = job.data.payload;

  const record = await db.$primary().import.findUniqueOrThrow({
    where: { id: importId },
    include: { project: true },
  });

  const jobLogger = logger.child({ importId, config: record.config });
  jobLogger.info('Starting import job');

  const providerInstance = createProvider(record, jobLogger);
  const shouldGenerateSessionIds = providerInstance.shouldGenerateSessionIds();

  try {
    const isRetry = record.currentStep !== null;
    const hasReachedProduction =
      isRetry && PRODUCTION_STEPS.includes(record.currentStep as string);

    // -------------------------------------------------------
    // STAGING PHASE: clean slate on failure, run from scratch
    // -------------------------------------------------------
    if (!hasReachedProduction) {
      if (isRetry) {
        jobLogger.info(
          'Retry detected before production phase — cleaning staging data'
        );
        await cleanupStagingData(importId);
      }

      // Phase 1: Load events into staging
      await updateImportStatus(jobLogger, job, importId, { step: 'loading' });

      const totalEvents = await providerInstance
        .getTotalEventsCount()
        .catch(() => -1);
      let processedEvents = 0;
      const eventBatch: IClickhouseEvent[] = [];

      for await (const rawEvent of providerInstance.parseSource()) {
        if (
          !providerInstance.validate(
            // @ts-expect-error -- provider-specific raw type
            rawEvent
          )
        ) {
          jobLogger.warn('Skipping invalid event', { rawEvent });
          continue;
        }

        const transformed: IClickhouseEvent = providerInstance.transformEvent(
          // @ts-expect-error -- provider-specific raw type
          rawEvent
        );

        // Session IDs for providers that need them (e.g. Mixpanel) are generated
        // in generateGapBasedSessionIds after loading, using gap-based logic.
        eventBatch.push(transformed);

        if (eventBatch.length >= BATCH_SIZE) {
          await insertImportBatch(eventBatch, importId);
          processedEvents += eventBatch.length;

          const batchDate = new Date(eventBatch[0]?.created_at || '')
            .toISOString()
            .split('T')[0];

          await updateImportStatus(jobLogger, job, importId, {
            step: 'loading',
            batch: batchDate,
            totalEvents,
            processedEvents,
          });

          eventBatch.length = 0;
          await yieldToEventLoop();
        }
      }

      if (eventBatch.length > 0) {
        await insertImportBatch(eventBatch, importId);
        processedEvents += eventBatch.length;

        const batchDate = new Date(eventBatch[0]?.created_at || '')
          .toISOString()
          .split('T')[0];

        await updateImportStatus(jobLogger, job, importId, {
          step: 'loading',
          batch: batchDate,
          totalEvents,
          processedEvents,
        });
        eventBatch.length = 0;
      }

      jobLogger.info('Loading complete', { processedEvents });

      // Phase 1b: Load user profiles (Mixpanel only)
      const profileBatchSize = 5000;
      if (
        'streamProfiles' in providerInstance &&
        typeof (providerInstance as MixpanelProvider).streamProfiles ===
          'function'
      ) {
        await updateImportStatus(jobLogger, job, importId, {
          step: 'loading_profiles',
        });

        const profileBatch: IClickhouseProfile[] = [];
        let processedProfiles = 0;

        for await (const rawProfile of (
          providerInstance as MixpanelProvider
        ).streamProfiles()) {
          const profile = (
            providerInstance as MixpanelProvider
          ).transformProfile(rawProfile);
          profileBatch.push(profile);

          if (profileBatch.length >= profileBatchSize) {
            await insertProfilesBatch(profileBatch, record.projectId);
            processedProfiles += profileBatch.length;
            await updateImportStatus(jobLogger, job, importId, {
              step: 'loading_profiles',
              processedProfiles,
            });
            profileBatch.length = 0;
            await yieldToEventLoop();
          }
        }

        if (profileBatch.length > 0) {
          await insertProfilesBatch(profileBatch, record.projectId);
          processedProfiles += profileBatch.length;
          await updateImportStatus(jobLogger, job, importId, {
            step: 'loading_profiles',
            processedProfiles,
            totalProfiles: processedProfiles,
          });
        }

        jobLogger.info('Profile loading complete', { processedProfiles });
      }

      // Phase 2: Generate gap-based session IDs (Mixpanel etc.)
      if (shouldGenerateSessionIds) {
        await updateImportStatus(jobLogger, job, importId, {
          step: 'generating_sessions',
        });
        await generateGapBasedSessionIds(importId);
        await yieldToEventLoop();
        jobLogger.info('Session ID generation complete');
      }

      // Phase 3: Create session_start / session_end events
      await updateImportStatus(jobLogger, job, importId, {
        step: 'creating_sessions',
        batch: 'all sessions',
      });
      await createSessionsStartEndEvents(importId);
      await yieldToEventLoop();

      jobLogger.info('Session event creation complete');
    }

    // -------------------------------------------------------
    // PRODUCTION PHASE: resume-safe, track progress per batch
    // -------------------------------------------------------

    // Phase 3: Move staging events to production (per-day)
    const resumeMovingFrom =
      hasReachedProduction && record.currentStep === 'moving'
        ? (record.currentBatch ?? undefined)
        : undefined;

    // currentBatch is the last successfully completed day — resume from the next day to avoid re-inserting it
    const moveFromDate = (() => {
      if (!resumeMovingFrom) return undefined;
      const next = new Date(`${resumeMovingFrom}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      return next.toISOString().split('T')[0]!;
    })();

    const bounds = await getImportDateBounds(importId, moveFromDate);
    if (bounds.min && bounds.max) {
      const startDate = bounds.min.split(' ')[0]!;
      const endDate = bounds.max.split(' ')[0]!;
      const cursor = new Date(`${startDate}T12:00:00Z`);
      const end = new Date(`${endDate}T12:00:00Z`);

      while (cursor <= end) {
        const dateStr = cursor.toISOString().split('T')[0]!;

        await moveImportsToProduction(importId, dateStr);
        await updateImportStatus(jobLogger, job, importId, {
          step: 'moving',
          batch: dateStr,
        });

        await yieldToEventLoop();
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    jobLogger.info('Move to production complete');

    // Phase 4: Backfill sessions table
    await updateImportStatus(jobLogger, job, importId, {
      step: 'backfilling_sessions',
      batch: 'all sessions',
    });
    await backfillSessionsToProduction(importId);
    await yieldToEventLoop();

    jobLogger.info('Session backfill complete');

    // Done
    await updateImportStatus(jobLogger, job, importId, { step: 'completed' });
    jobLogger.info('Import completed');

    return { success: true };
  } catch (error) {
    jobLogger.error('Import job failed', { error });

    try {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await updateImportStatus(jobLogger, job, importId, {
        step: 'failed',
        errorMessage: errorMsg,
      });
    } catch (markError) {
      jobLogger.error('Failed to mark import as failed', { error, markError });
    }

    throw error;
  }
}

function createProvider(
  record: Prisma.ImportGetPayload<{ include: { project: true } }>,
  jobLogger: ILogger
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
