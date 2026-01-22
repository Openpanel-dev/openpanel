import type { CronQueueType } from '@openpanel/queue';
import { cronQueue } from '@openpanel/queue';

import { logger } from './utils/logger';

export async function bootCron() {
  const jobs: {
    name: string;
    type: CronQueueType;
    pattern: string | number;
  }[] = [
    {
      name: 'salt',
      type: 'salt',
      pattern: '0 0 * * *',
    },
    {
      name: 'deleteProjects',
      type: 'deleteProjects',
      pattern: '0 * * * *',
    },
    {
      name: 'flush',
      type: 'flushEvents',
      pattern: 1000 * 10,
    },
    {
      name: 'flush',
      type: 'flushProfiles',
      pattern: 1000 * 60,
    },
    {
      name: 'flush',
      type: 'flushSessions',
      pattern: 1000 * 10,
    },
    {
      name: 'insightsDaily',
      type: 'insightsDaily',
      pattern: '0 2 * * *',
    },
    {
      name: 'onboarding',
      type: 'onboarding',
      pattern: '0 * * * *',
    },
  ];

  if (process.env.SELF_HOSTED && process.env.NODE_ENV === 'production') {
    jobs.push({
      name: 'ping',
      type: 'ping',
      pattern: '0 0 * * *',
    });
  }

  logger.info('Updating cron jobs');

  const jobSchedulers = await cronQueue.getJobSchedulers();
  for (const jobScheduler of jobSchedulers) {
    await cronQueue.removeJobScheduler(jobScheduler.key);
  }

  // Add repeatable jobs
  for (const job of jobs) {
    await cronQueue.upsertJobScheduler(
      job.type,
      typeof job.pattern === 'number'
        ? {
            every: job.pattern,
          }
        : {
            pattern: job.pattern,
          },
      {
        data: {
          type: job.type,
          payload: undefined,
        },
      },
    );
  }
}
