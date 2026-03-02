import type { Job } from 'bullmq';

import { eventBuffer, profileBuffer, sessionBuffer } from '@openpanel/db';
import type { CronQueuePayload } from '@openpanel/queue';

import { customAlerts } from './cron.custom-alerts';
import { jobdeleteProjects } from './cron.delete-projects';
import { materializeColumns } from './cron.materialize-columns';
import { ping } from './cron.ping';
import { salt } from './cron.salt';

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
    case 'ping': {
      return await ping();
    }
    case 'deleteProjects': {
      return await jobdeleteProjects(job);
    }
    case 'materializeColumns': {
      return await materializeColumns({
        dryRun: job.data.dryRun ?? false,
        threshold: job.data.threshold ?? 150,
      });
    }
    case 'customAlerts': {
      return await customAlerts();
    }
  }
}
