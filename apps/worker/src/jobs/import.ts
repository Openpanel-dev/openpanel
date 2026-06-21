import {
  backfillSessionsToProduction,
  cleanupSessionStartEndEvents,
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
import {
  AmplitudeProvider,
  MixpanelProvider,
  UmamiProvider,
} from '@openpanel/importer';
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

const RESUMABLE_STEPS = ['creating_sessions', 'moving', 'backfilling_sessions'];

/**
 * Merge a freshly-derived profile into the bounded dedup map: keep the earliest
 * created_at (first seen), advance last_seen_at to the latest activity, and fill
 * identity fields/properties, preferring the newer row.
 */
function mergeProfileInto(
  map: Map<string, IClickhouseProfile>,
  incoming: IClickhouseProfile
): void {
  const existing = map.get(incoming.id);
  if (!existing) {
    map.set(incoming.id, incoming);
    return;
  }

  const createdAt =
    existing.created_at < incoming.created_at
      ? existing.created_at
      : incoming.created_at;
  const isIncomingNewer = incoming.last_seen_at >= existing.last_seen_at;
  const base = isIncomingNewer ? incoming : existing;
  const other = isIncomingNewer ? existing : incoming;

  map.set(incoming.id, {
    ...base,
    created_at: createdAt,
    first_name: base.first_name || other.first_name,
    last_name: base.last_name || other.last_name,
    email: base.email || other.email,
    avatar: base.avatar || other.avatar,
    properties: { ...other.properties, ...base.properties },
  });
}

export async function importJob(job: Job<ImportQueuePayload>) {
  const { importId } = job.data.payload;

  const record = await db.import.findUniqueOrThrow({
    where: { id: importId },
    include: { project: true },
  });

  const jobLogger = logger.child({ importId, config: record.config });
  jobLogger.info('Starting import job');

  const providerInstance = createProvider(record, jobLogger);
  const shouldGenerateSessionIds = providerInstance.shouldGenerateSessionIds();

  try {
    const isRetry = record.currentStep !== null;
    const canResume =
      isRetry && RESUMABLE_STEPS.includes(record.currentStep as string);

    // -------------------------------------------------------
    // STAGING PHASE: clean slate on failure, run from scratch
    // -------------------------------------------------------
    if (!canResume) {
      if (isRetry) {
        jobLogger.info(
          'Retry detected before resumable phase — cleaning staging data'
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

      // Profiles derived inline from events (e.g. Amplitude, which has no
      // profile export API). A bounded dedup map keeps memory flat regardless of
      // event volume; the profiles table's ReplacingMergeTree(last_seen_at)
      // collapses any duplicate rows that span flush boundaries to the latest
      // activity per id.
      const canProfileFromEvents =
        typeof (providerInstance as AmplitudeProvider)
          .transformEventToProfile === 'function';
      const PROFILE_MAP_CAP = 50_000;
      const profileMap = new Map<string, IClickhouseProfile>();
      let processedProfiles = 0;

      const flushProfiles = async () => {
        if (profileMap.size === 0) {
          return;
        }
        const values = Array.from(profileMap.values());
        await insertProfilesBatch(values, record.projectId);
        processedProfiles += values.length;
        profileMap.clear();
        await updateImportStatus(jobLogger, job, importId, {
          step: 'loading_profiles',
          processedProfiles,
        });
        await yieldToEventLoop();
      };

      for await (const rawEvent of providerInstance.parseSource()) {
        if (
          !providerInstance.validate(
            // @ts-expect-error -- provider-specific raw type
            rawEvent
          )
        ) {
          jobLogger.warn({ rawEvent }, 'Skipping invalid event');
          continue;
        }

        const transformed: IClickhouseEvent = providerInstance.transformEvent(
          // @ts-expect-error -- provider-specific raw type
          rawEvent
        );

        // Session IDs for providers that need them (e.g. Mixpanel) are generated
        // in generateGapBasedSessionIds after loading, using gap-based logic.
        eventBatch.push(transformed);

        if (canProfileFromEvents) {
          const profile = (
            providerInstance as AmplitudeProvider
          ).transformEventToProfile(
            // @ts-expect-error -- provider-specific raw type
            rawEvent
          );
          if (profile) {
            mergeProfileInto(profileMap, profile);
            if (profileMap.size >= PROFILE_MAP_CAP) {
              await flushProfiles();
            }
          }
        }

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

      jobLogger.info({ processedEvents }, 'Loading complete');

      // Phase 1a: Flush profiles derived inline from events (Amplitude)
      if (canProfileFromEvents) {
        await flushProfiles();
        jobLogger.info(
          { processedProfiles },
          'Inline profile derivation complete'
        );
      }

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

        jobLogger.info({ processedProfiles }, 'Profile loading complete');
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
    }

    // -------------------------------------------------------
    // SESSION CREATION PHASE: resumable by cleaning session_start/end
    // -------------------------------------------------------
    const skipSessionCreation =
      canResume && record.currentStep !== 'creating_sessions';

    if (!skipSessionCreation) {
      if (canResume && record.currentStep === 'creating_sessions') {
        jobLogger.info(
          'Retry at creating_sessions — cleaning existing session_start/end events'
        );
        await cleanupSessionStartEndEvents(importId);
      }

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
      canResume && record.currentStep === 'moving'
        ? (record.currentBatch ?? undefined)
        : undefined;

    // currentBatch is the last successfully completed day — resume from the next day to avoid re-inserting it
    const moveFromDate = (() => {
      if (!resumeMovingFrom) {
        return undefined;
      }
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
    jobLogger.error({ err: error }, 'Import job failed');

    try {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await updateImportStatus(jobLogger, job, importId, {
        step: 'failed',
        errorMessage: errorMsg,
      });
    } catch (markError) {
      jobLogger.error(
        { err: error, markError },
        'Failed to mark import as failed',
      );
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
    case 'amplitude':
      return new AmplitudeProvider(record.projectId, config, jobLogger);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
