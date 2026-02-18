import type { Job } from 'bullmq';

import { eventBuffer, profileBackfillBuffer, profileBuffer, sessionBuffer } from '@openpanel/db';
import type { CronQueuePayload } from '@openpanel/queue';

import { jobdeleteProjects } from './cron.delete-projects';
import { onboardingJob } from './cron.onboarding';
import { ping } from './cron.ping';
import { salt } from './cron.salt';
import { insightsDailyJob } from './insights';

export async function cronJob(job: Job<CronQueuePayload>) {
  switch (job.data.type) {
    case 'salt': {
      return await salt();
    }
    case 'flushEvents': {
      return await eventBuffer.tryFlush();
    }
    case 'flushProfiles': {
      return await profileBuffer.tryFlush();
    }
    case 'flushSessions': {
      return await sessionBuffer.tryFlush();
    }
    case 'flushProfileBackfill': {
      return await profileBackfillBuffer.tryFlush();
    }
    case 'ping': {
      return await ping();
    }
    case 'deleteProjects': {
      return await jobdeleteProjects(job);
    }
    case 'insightsDaily': {
      return await insightsDailyJob(job);
    }
    case 'onboarding': {
      return await onboardingJob(job);
    }
  }
}
