// Ported from apps/worker/src/jobs/sessions.ts (M7-001): after each
// session_end the owning project's and organization's event counters are
// refreshed, at most once an hour per project, and usage alert emails go out
// at 80% / 100% of the billing limit.

import type { Organization } from '@openpanel/db/src/prisma-client';
import { cacheable } from '@openpanel/redis';
import { sendEmail } from '../../../clients/email';
import { createLogger, type ILogger } from '../../../clients/logger';
import type { Logger } from '../../../logger';
import { getOrganizationBillingEventsCount } from '../../../v1-compat';

// project.service.ts's `getProjectEventsCount` takes `ServiceDeps` now
// (M10-004); this file has none (its own db access is the lazy `loadDb()`
// below), so it reaches the bare, v1-compat-wrapped spelling instead.
// GENUINE CYCLE, kept lazy: services.ts -> session.service.ts -> this file
// -> v1-compat.ts -> services.ts.
function loadProjectService() {
  return import('../../../v1-compat');
}

const INT4_MAX = 2_147_483_647;
const USAGE_WARNING_THRESHOLD = 0.8;
const UPDATE_EVENTS_COUNT_CACHE_SECONDS = 60 * 60;
const DEFAULT_DASHBOARD_URL = 'https://dashboard.openpanel.dev';

// M10-009: `updateEventsCount` is `cacheable`, whose key is derived from the
// call's ARGUMENTS (packages/redis/cachable.ts), so it cannot take a
// `ServiceDeps` leading parameter — Postgres comes through the same declared
// v1-compat seam this file already reaches for `getProjectEventsCount`, which
// hands back the boot scope's `AppDeps.db` rather than a second singleton.
function loadDb() {
  return import('../../../v1-compat').then((m) => m.compatDb());
}

// `cacheable` keys on the function's arguments, so the per-run ctx.logger
// cannot travel with the projectId; a module logger, created on first use
// (same as import.service.ts), stands in for it.
let _logger: ILogger | undefined;
function getLogger(): Logger {
  _logger ??= createLogger({ name: 'core:session' });
  return _logger;
}

function isSelfHosted(): boolean {
  return process.env.SELF_HOSTED === 'true';
}

/** Saturating: the columns are INT4 and lifetime counts can exceed them. */
function clampToInt4(count: number): number {
  return Math.min(count, INT4_MAX);
}

function nextExceededAt(
  organization: Organization,
  count: number
): Date | null {
  // Self-hosting has no billing limits: never flag, and clear any stale flag
  // set before this guard existed (default limit 0 trips on the first event).
  if (isSelfHosted()) {
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

export const updateEventsCount = cacheable(async function updateEventsCount(
  projectId: string
) {
  const logger = getLogger();
  const db = await loadDb();
  const organization = await db.organization.findFirst({
    where: { projects: { some: { id: projectId } } },
    include: { projects: true },
  });

  if (!organization) {
    return;
  }

  const organizationEventsCount =
    await getOrganizationBillingEventsCount(organization);
  const { getProjectEventsCount } = await loadProjectService();
  const projectEventsCount = await getProjectEventsCount(projectId);

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
          organizationEventsCount
        ),
      },
    });

    if (!isSelfHosted()) {
      try {
        await sendUsageAlerts(organization, organizationEventsCount, logger);
      } catch (error) {
        logger.error({ err: error }, 'Failed to send usage alert emails');
      }
    }
  }

  return true;
}, UPDATE_EVENTS_COUNT_CACHE_SECONDS);

/**
 * One warning at 80% and one notice at 100% per billing cycle. The sent-at
 * markers are cleared by the Polar webhook when a new cycle resets the usage
 * counter (or the limit is raised), so each cycle can alert again.
 */
async function sendUsageAlerts(
  organization: Organization,
  count: number,
  logger: Logger
) {
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

  const db = await loadDb();

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

    const billingUrl = `${process.env.DASHBOARD_URL ?? DEFAULT_DASHBOARD_URL}/${organization.id}/billing`;
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
