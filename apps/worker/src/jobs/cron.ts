import {
  eventBuffer,
  groupBuffer,
  profileBackfillBuffer,
  profileBuffer,
  replayBuffer,
  sessionBuffer,
} from '@openpanel/db';
import type { CronQueuePayload } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { cohortRefreshCronJob } from './cron.cohort-refresh';
import { jobDelete } from './cron.delete';
import { insightCleanupCronJob } from './cron.insight-cleanup';
import { weeklyDigestCronJob } from './cron.weekly-digest';
import { onboardingJob } from './cron.onboarding';
import { ping } from './cron.ping';
import { salt } from './cron.salt';
import { sessionReaperCronJob } from './cron.session-reaper';
import { sessionVacuumCronJob } from './cron.session-vacuum';
import { gscSyncAllJob } from './gsc';
import { insightsDailyJob } from './insights';
import { logger } from '@/utils/logger';

export async function cronJob(job: Job<CronQueuePayload>) {
  logger.debug(`Cron job started - ${job.data.type}`);
  switch (job.data.type) {
    case 'salt': {
      return await salt();
    }
    case 'flushEvents': {
      return await eventBuffer.tryFlush({ trigger: 'cron' });
    }
    case 'flushProfiles': {
      return await profileBuffer.tryFlush({ trigger: 'cron' });
    }
    case 'flushSessions': {
      return await sessionBuffer.tryFlush({ trigger: 'cron' });
    }
    case 'flushProfileBackfill': {
      return await profileBackfillBuffer.tryFlush({ trigger: 'cron' });
    }
    case 'flushReplay': {
      return await replayBuffer.tryFlush({ trigger: 'cron' });
    }
    case 'flushGroups': {
      return await groupBuffer.tryFlush({ trigger: 'cron' });
    }
    case 'ping': {
      return await ping();
    }
    case 'delete': {
      return await jobDelete();
    }
    case 'insightsDaily': {
      return await insightsDailyJob(job);
    }
    case 'onboarding': {
      return await onboardingJob(job);
    }
    case 'gscSync': {
      return await gscSyncAllJob();
    }
    case 'cohortRefresh': {
      return await cohortRefreshCronJob();
    }
    case 'sessionReaper': {
      return await sessionReaperCronJob();
    }
    case 'sessionVacuum': {
      return await sessionVacuumCronJob();
    }
    case 'insightCleanup': {
      return await insightCleanupCronJob();
    }
    case 'weeklyDigest': {
      return await weeklyDigestCronJob();
    }
  }
}
