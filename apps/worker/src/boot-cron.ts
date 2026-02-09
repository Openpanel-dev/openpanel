import type { CronQueueType } from '@openpanel/queue';
import { cronQueue } from '@openpanel/queue';

import { logger } from './utils/logger';

async function removeConflictingJobs(schedulerKey: string) {
  // Remove any existing jobs that might conflict with the scheduler
  // BullMQ scheduler jobs have IDs like "repeat:<key>:<timestamp>"
  const jobStates = ['delayed', 'waiting', 'completed', 'failed'] as const;

  for (const state of jobStates) {
    try {
      const jobs = await cronQueue.getJobs([state]);
      for (const job of jobs) {
        // Check if this job was created by the scheduler we're about to upsert
        if (job.id?.startsWith(`repeat:${schedulerKey}:`)) {
          await job.remove();
          logger.info('Removed conflicting scheduler job', {
            jobId: job.id,
            schedulerKey,
          });
        }
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}

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
      pattern: 1000 * 10,
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

  const jobsToKeep = new Set(jobs.map((job) => job.type));

  const currentJobSchedulers = await cronQueue
    .getJobSchedulers()
    .catch((error) => {
      logger.error('Error getting job schedulers', {
        error,
      });
      return [];
    });
  for (const jobScheduler of currentJobSchedulers) {
    if (!jobsToKeep.has(jobScheduler.key as CronQueueType)) {
      await cronQueue.removeJobScheduler(jobScheduler.key).catch((error) => {
        logger.error('Error removing job scheduler', {
          error,
          jobScheduler: jobScheduler.key,
        });
      });
    }
  }

  for (const job of jobs) {
    try {
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
    } catch (error) {
      // If upsert fails due to conflicting job, try to clean up and retry
      const isConflictError =
        error instanceof Error &&
        error.message.includes('job ID already exists');

      if (isConflictError) {
        logger.warn('Job scheduler conflict detected, attempting cleanup', {
          job: job.type,
        });

        await removeConflictingJobs(job.type);

        // Also try removing the scheduler itself to start fresh
        try {
          await cronQueue.removeJobScheduler(job.type);
        } catch {
          // Ignore - scheduler might not exist
        }

        // Retry the upsert
        try {
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
          logger.info('Job scheduler created after cleanup', {
            job: job.type,
          });
        } catch (retryError) {
          logger.error('Error upserting job scheduler after cleanup', {
            error: retryError,
            job: job.type,
          });
        }
      } else {
        logger.error('Error upserting job scheduler', {
          error,
          job: job.type,
        });
      }
    }
  }
}
