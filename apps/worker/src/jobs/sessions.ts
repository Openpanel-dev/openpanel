import type { Job } from 'bullmq';

import type { SessionsQueuePayload } from '@openpanel/queue';

import { logger } from '@/utils/logger';
import {
  db,
  getOrganizationBillingEventsCount,
  getProjectEventsCount,
} from '@openpanel/db';
import type { Organization } from '@openpanel/db';
import { sendEmail } from '@openpanel/email';
import { cacheable } from '@openpanel/redis';
import { createSessionEnd } from './events.create-session-end';

const INT4_MAX = 2_147_483_647;
const USAGE_WARNING_THRESHOLD = 0.8;

export async function sessionsJob(job: Job<SessionsQueuePayload>) {
  const res = await createSessionEnd(job);
  try {
    await updateEventsCount(job.data.payload.projectId);
  } catch (e) {
    logger.error({ err: e }, 'Failed to update events count');
  }
  return res;
}

const updateEventsCount = cacheable(async function updateEventsCount(
  projectId: string,
) {
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
        // Saturating counter: the column is INT4 and lifetime counts can
        // exceed it. It's only used as a sort key and activity threshold,
        // never for billing, so clamping is safe.
        eventsCount: Math.min(projectEventsCount, INT4_MAX),
      },
    });
  }

  if (organizationEventsCount) {
    // Self-hosting has no billing/event limits. Never flag the org as
    // exceeded, and clear any stale flag that was set before this guard
    // existed (default limit is 0, which otherwise trips on the first event).
    const isSelfHosted = process.env.SELF_HOSTED === 'true';

    await db.organization.update({
      where: {
        id: organization.id,
      },
      data: {
        subscriptionPeriodEventsCount: Math.min(
          organizationEventsCount,
          INT4_MAX,
        ),
        subscriptionPeriodEventsCountExceededAt: isSelfHosted
          ? null
          : organizationEventsCount >
                organization.subscriptionPeriodEventsLimit &&
              !organization.subscriptionPeriodEventsCountExceededAt
            ? new Date()
            : organizationEventsCount <=
                organization.subscriptionPeriodEventsLimit
              ? null
              : organization.subscriptionPeriodEventsCountExceededAt,
      },
    });

    if (!isSelfHosted) {
      try {
        await sendUsageAlerts(organization, organizationEventsCount);
      } catch (e) {
        logger.error({ err: e }, 'Failed to send usage alert emails');
      }
    }
  }

  return true;
}, 60 * 60);

/**
 * One warning at 80% and one notice at 100% per billing cycle. The sent-at
 * markers are cleared by the Polar webhook when a new cycle resets the usage
 * counter (or the limit is raised), so each cycle can alert again.
 */
async function sendUsageAlerts(organization: Organization, count: number) {
  const limit = organization.subscriptionPeriodEventsLimit;
  if (!limit || limit <= 0) {
    return;
  }

  const exceeded = count > limit && !organization.usageExceededSentAt;
  const nearLimit =
    !exceeded &&
    count >= limit * USAGE_WARNING_THRESHOLD &&
    count <= limit &&
    !organization.usageWarningSentAt;

  if (!exceeded && !nearLimit) {
    return;
  }

  const admins = await db.member.findMany({
    where: {
      organizationId: organization.id,
      role: 'org:admin',
      user: { deletedAt: null },
    },
    include: { user: { select: { email: true, firstName: true } } },
  });

  const billingUrl = `${process.env.DASHBOARD_URL}/${organization.id}/billing`;
  const recipients = new Map(
    admins
      .filter((member) => member.user?.email)
      .map((member) => [member.user!.email, member.user!.firstName ?? undefined])
  );

  for (const [email, firstName] of recipients) {
    if (exceeded) {
      await sendEmail('usage-limit-exceeded', {
        to: email,
        data: {
          firstName,
          organizationName: organization.name,
          billingUrl,
          eventsLimit: limit,
        },
      });
    } else {
      await sendEmail('usage-near-limit', {
        to: email,
        data: {
          firstName,
          organizationName: organization.name,
          billingUrl,
          eventsCount: count,
          eventsLimit: limit,
        },
      });
    }
  }

  await db.organization.update({
    where: { id: organization.id },
    data: exceeded
      ? // Mark the warning as sent too — crossing both thresholds between two
        // runs must not queue a redundant warning after the exceeded notice.
        { usageExceededSentAt: new Date(), usageWarningSentAt: new Date() }
      : { usageWarningSentAt: new Date() },
  });

  logger.info(
    {
      organizationId: organization.id,
      count,
      limit,
      kind: exceeded ? 'exceeded' : 'near-limit',
      recipients: recipients.size,
    },
    'Sent usage alert emails'
  );
}
