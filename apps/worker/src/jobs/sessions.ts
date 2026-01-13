import type { Job } from 'bullmq';

import type { SessionsQueuePayload } from '@openpanel/queue';

import { logger } from '@/utils/logger';
import {
  db,
  getOrganizationBillingEventsCount,
  getProjectEventsCount,
} from '@openpanel/db';
import { cacheable, getRedisCache } from '@openpanel/redis';
import { createSessionEnd } from './events.create-session-end';

export async function sessionsJob(job: Job<SessionsQueuePayload>) {
  const res = await createSessionEnd(job);
  try {
    await updateEventsCount(job.data.payload.projectId);
  } catch (e) {
    logger.error('Failed to update events count', e);
  }
  return res;
}

const updateEventsCount = cacheable(async function updateEventsCount(
  projectId: string,
) {
  // Acquire Redis lock to prevent duplicate executions across multiple workers
  const lockKey = `lock:update-events:${projectId}`;
  const redis = getRedisCache();
  const acquired = await redis.set(lockKey, '1', 'EX', 10, 'NX');

  if (!acquired) {
    // Another worker is already updating this project, skip
    logger.info('Skipping updateEventsCount - lock held by another worker', {
      projectId,
    });
    return;
  }

  const organization = await db.organization.findFirst({
    where: {
      projects: {
        some: {
          id: projectId,
        },
      },
    },
    include: {
      projects: true,
    },
  });

  if (!organization) {
    return;
  }

  const organizationEventsCount =
    await getOrganizationBillingEventsCount(organization);
  const projectEventsCount = await getProjectEventsCount(projectId);

  if (projectEventsCount) {
    await db.project.update({
      where: {
        id: projectId,
      },
      data: {
        eventsCount: projectEventsCount,
      },
    });
  }

  if (organizationEventsCount) {
    await db.organization.update({
      where: {
        id: organization.id,
      },
      data: {
        subscriptionPeriodEventsCount: organizationEventsCount,
        subscriptionPeriodEventsCountExceededAt:
          organizationEventsCount >
            organization.subscriptionPeriodEventsLimit &&
          !organization.subscriptionPeriodEventsCountExceededAt
            ? new Date()
            : organizationEventsCount <=
                organization.subscriptionPeriodEventsLimit
              ? null
              : organization.subscriptionPeriodEventsCountExceededAt,
      },
    });
  }

  return true;
}, 60 * 60);
