import type { CronQueueType } from '@openpanel/queue';
import { cronQueue } from '@openpanel/queue';

import { getLock } from '@openpanel/redis';
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
  ];

  if (process.env.SELF_HOSTED && process.env.NODE_ENV === 'production') {
    jobs.push({
      name: 'ping',
      type: 'ping',
      pattern: '0 0 * * *',
    });
  }

  const lock = await getLock('cron:lock', '1', 1000 * 60 * 60 * 5);

  if (lock) {
    logger.info('Cron lock acquired');
  } else {
    logger.info('Cron lock not acquired');
  }

  if (lock) {
    logger.info('Updating cron jobs');
    // TODO: Switch to getJobSchedulers
    const repeatableJobs = await cronQueue.getRepeatableJobs();
    for (const repeatableJob of repeatableJobs) {
      cronQueue.removeRepeatableByKey(repeatableJob.key);
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
}
