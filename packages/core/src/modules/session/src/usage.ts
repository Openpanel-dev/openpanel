// Ported from apps/worker/src/jobs/sessions.ts (M7-001): after each
// session_end the owning project's and organization's event counters are
// refreshed, at most once an hour per project, and usage alert emails go out
// at 80% / 100% of the billing limit.

import type { Organization } from '@openpanel/db/src/prisma-client';
import { cacheablePerDeps } from '../../../cacheable-per-deps';
import { sendEmail } from '../../../clients/email';
import type { ServiceDeps } from '../../../services';
import { getOrganizationBillingEventsCount } from '../../organization/organization.service';
import { getProjectEventsCount } from '../../project/project.service';

const INT4_MAX = 2_147_483_647;
const USAGE_WARNING_THRESHOLD = 0.8;
const UPDATE_EVENTS_COUNT_CACHE_SECONDS = 60 * 60;
const DEFAULT_DASHBOARD_URL = 'https://dashboard.openpanel.dev';

/** Saturating: the columns are INT4 and lifetime counts can exceed them. */
function clampToInt4(count: number): number {
  return Math.min(count, INT4_MAX);
}

function nextExceededAt(
  organization: Organization,
  count: number,
  selfHosted: boolean
): Date | null {
  // Self-hosting has no billing limits: never flag, and clear any stale flag
  // set before this guard existed (default limit 0 trips on the first event).
  if (selfHosted) {
    return null;
  }
  const limit = organization.subscriptionPeriodEventsLimit;
  if (count > limit && !organization.subscriptionPeriodEventsCountExceededAt) {
    return new Date();
  }
  if (count <= limit) {
    return null;
  }
  return organization.subscriptionPeriodEventsCountExceededAt;
}

export const updateEventsCount = cacheablePerDeps(
  'updateEventsCount',
  async (deps: ServiceDeps, projectId: string): Promise<true | undefined> => {
    const logger = deps.logger;
    const db = deps.db;
    const organization = await db.organization.findFirst({
      where: { projects: { some: { id: projectId } } },
      include: { projects: true },
    });

    if (!organization) {
      return;
    }

    const organizationEventsCount = await getOrganizationBillingEventsCount(
      deps,
      organization
    );
    const projectEventsCount = await getProjectEventsCount(deps, projectId);

    if (projectEventsCount) {
      // Only a sort key and activity threshold, never billing — clamping is safe.
      await db.project.update({
        where: { id: projectId },
        data: { eventsCount: clampToInt4(projectEventsCount) },
      });
    }

    if (organizationEventsCount) {
      await db.organization.update({
        where: { id: organization.id },
        data: {
          subscriptionPeriodEventsCount: clampToInt4(organizationEventsCount),
          subscriptionPeriodEventsCountExceededAt: nextExceededAt(
            organization,
            organizationEventsCount,
            deps.config.selfHosted
          ),
        },
      });

      if (!deps.config.selfHosted) {
        try {
          await sendUsageAlerts(deps, organization, organizationEventsCount);
        } catch (error) {
          logger.error({ err: error }, 'Failed to send usage alert emails');
        }
      }
    }

    return true;
  },
  UPDATE_EVENTS_COUNT_CACHE_SECONDS
);

/**
 * One warning at 80% and one notice at 100% per billing cycle. The sent-at
 * markers are cleared by the Polar webhook when a new cycle resets the usage
 * counter (or the limit is raised), so each cycle can alert again.
 */
async function sendUsageAlerts(
  deps: ServiceDeps,
  organization: Organization,
  count: number
) {
  const logger = deps.logger;
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

  if (!(exceeded || nearLimit)) {
    return;
  }

  const db = deps.db;

  // Claim the alert atomically BEFORE sending: session jobs for different
  // projects of the same org can run concurrently, and both would otherwise
  // read null markers and double-send. Marking the warning together with the
  // exceeded notice keeps a both-thresholds-in-one-jump crossing from queueing
  // a redundant warning afterwards. Rolled back if every send fails.
  const claimedAt = new Date();
  const claimed = await db.organization.updateMany({
    where: {
      id: organization.id,
      ...(exceeded
        ? { usageExceededSentAt: null }
        : { usageWarningSentAt: null }),
    },
    data: exceeded
      ? { usageExceededSentAt: claimedAt, usageWarningSentAt: claimedAt }
      : { usageWarningSentAt: claimedAt },
  });
  if (claimed.count === 0) {
    return;
  }

  try {
    const admins = await db.member.findMany({
      where: {
        organizationId: organization.id,
        role: 'org:admin',
        user: { deletedAt: null },
      },
      include: { user: { select: { email: true, firstName: true } } },
    });

    const billingUrl = `${deps.config.dashboardUrl || DEFAULT_DASHBOARD_URL}/${organization.id}/billing`;
    const recipients = new Map<string, string | undefined>();
    for (const member of admins) {
      if (member.user?.email) {
        recipients.set(member.user.email, member.user.firstName ?? undefined);
      }
    }

    let failedRecipients = 0;
    for (const [email, firstName] of recipients) {
      // One bad address must not abort the loop or roll back the claim —
      // that would re-email the recipients that succeeded.
      try {
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
      } catch (error) {
        failedRecipients++;
        logger.error(
          { err: error, organizationId: organization.id, recipient: email },
          'Failed to send usage alert to recipient'
        );
      }
    }

    logger.info(
      {
        organizationId: organization.id,
        count,
        limit,
        kind: exceeded ? 'exceeded' : 'near-limit',
        recipients: recipients.size,
        failedRecipients,
      },
      'Sent usage alert emails'
    );
  } catch (error) {
    // Release the claim so the next usage update retries the alert.
    await db.organization.updateMany({
      where: { id: organization.id },
      data: exceeded
        ? {
            usageExceededSentAt: null,
            usageWarningSentAt: organization.usageWarningSentAt,
          }
        : { usageWarningSentAt: null },
    });
    throw error;
  }
}
