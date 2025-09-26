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
  ];

  if (
    (process.env.NEXT_PUBLIC_SELF_HOSTED === 'true' ||
      process.env.SELF_HOSTED) &&
    process.env.NODE_ENV === 'production'
  ) {
    jobs.push({
      name: 'ping',
      type: 'ping',
      pattern: '0 0 * * *',
    });
  }

  // Add repeatable jobs
  for (const job of jobs) {
    await cronQueue.add(
      job.name,
      {
        type: job.type,
        payload: undefined,
      },
      {
        jobId: job.type,
        repeat:
          typeof job.pattern === 'number'
            ? {
                every: job.pattern,
              }
            : {
                pattern: job.pattern,
              },
      },
    );
  }

  // Remove outdated repeatable jobs
  const repeatableJobs = await cronQueue.getRepeatableJobs();
  for (const repeatableJob of repeatableJobs) {
    const match = jobs.find(
      (job) => `${job.name}:${job.type}:::${job.pattern}` === repeatableJob.key,
    );
    if (match) {
      logger.info('Repeatable job exists', {
        key: repeatableJob.key,
      });
    } else {
      logger.info('Removing repeatable job', {
        key: repeatableJob.key,
      });
      cronQueue.removeRepeatableByKey(repeatableJob.key);
    }
  }
}
