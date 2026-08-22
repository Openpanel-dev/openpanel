import { db, getLastEventPerProject } from '@openpanel/db';
import { sendEmail } from '@openpanel/email';
import { logger as baseLogger } from '@/utils/logger';

const logger = baseLogger.child({ job: 'data-health' });

const DAY_MS = 24 * 60 * 60 * 1000;
// A brand-new project gets 48h to send its first event before we reach out.
const NO_DATA_AFTER_MS = 2 * DAY_MS;
// An active project whose newest event is older than this counts as stalled.
const STALLED_AFTER_MS = 7 * DAY_MS;

interface OrgAlert {
  organizationId: string;
  noData: { id: string; name: string }[];
  stalled: { id: string; name: string; lastEventAt: Date }[];
}

async function recipientsForOrg(organizationId: string) {
  const members = await db.member.findMany({
    where: {
      organizationId,
      user: { deletedAt: null },
    },
    include: { user: { select: { email: true, firstName: true } } },
  });
  const seen = new Map<string, string | undefined>();
  for (const member of members) {
    if (member.user?.email && !seen.has(member.user.email)) {
      seen.set(member.user.email, member.user.firstName ?? undefined);
    }
  }
  return seen;
}

/**
 * Daily rescue emails for paying/trialing orgs whose tracking is broken:
 * projects that never received an event (48h grace) and projects whose event
 * flow stalled for 7+ days. A silently broken install reads as "the product
 * stopped working" — a working install is the cheapest retention there is.
 *
 * Dedupe: `noDataNotifiedAt` is sent once per project; `dataStoppedNotifiedAt`
 * is compared against the newest event, so data resuming and stalling again
 * notifies again without any clearing step.
 */
export async function dataHealthCronJob() {
  if (process.env.SELF_HOSTED === 'true') {
    return;
  }

  const now = Date.now();
  const lastEventByProject = await getLastEventPerProject();

  // Prefilter on the raw status column (computed fields can't be used in
  // `where`), then refine with the canonical subscription state below.
  const projects = await db.project.findMany({
    where: {
      deleteAt: null,
      organization: { subscriptionStatus: { in: ['active', 'trialing'] } },
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      organizationId: true,
      noDataNotifiedAt: true,
      dataStoppedNotifiedAt: true,
      organization: { select: { id: true, subscriptionState: true } },
    },
  });

  const byOrg = new Map<string, OrgAlert>();

  for (const project of projects) {
    const state = project.organization.subscriptionState;
    if (state !== 'active' && state !== 'trialing') {
      continue;
    }

    const lastEventAt = lastEventByProject.get(project.id);

    if (!lastEventAt) {
      // Never received an event. One notice per project, after the grace
      // period. (The onboarding drip already nudges brand-new orgs, so this
      // mainly catches additional projects and broken installs.)
      const oldEnough = now - project.createdAt.getTime() > NO_DATA_AFTER_MS;
      if (oldEnough && !project.noDataNotifiedAt) {
        const entry = byOrg.get(project.organizationId) ?? {
          organizationId: project.organizationId,
          noData: [],
          stalled: [],
        };
        entry.noData.push({ id: project.id, name: project.name });
        byOrg.set(project.organizationId, entry);
      }
      continue;
    }

    const stalled = now - lastEventAt.getTime() > STALLED_AFTER_MS;
    const alreadyNotifiedForThisStall =
      project.dataStoppedNotifiedAt &&
      project.dataStoppedNotifiedAt > lastEventAt;
    if (stalled && !alreadyNotifiedForThisStall) {
      const entry = byOrg.get(project.organizationId) ?? {
        organizationId: project.organizationId,
        noData: [],
        stalled: [],
      };
      entry.stalled.push({
        id: project.id,
        name: project.name,
        lastEventAt,
      });
      byOrg.set(project.organizationId, entry);
    }
  }

  let emailsSent = 0;

  for (const alert of byOrg.values()) {
    try {
      const recipients = await recipientsForOrg(alert.organizationId);
      if (recipients.size === 0) {
        continue;
      }

      const dashboardUrl = `${process.env.DASHBOARD_URL}/${alert.organizationId}`;

      if (alert.noData.length > 0) {
        for (const [to, firstName] of recipients) {
          await sendEmail('tracking-no-data', {
            to,
            data: {
              firstName,
              projectNames: alert.noData.map((p) => p.name),
              dashboardUrl,
            },
          });
          emailsSent++;
        }
        await db.project.updateMany({
          where: { id: { in: alert.noData.map((p) => p.id) } },
          data: { noDataNotifiedAt: new Date() },
        });
      }

      if (alert.stalled.length > 0) {
        const newestLastEvent = alert.stalled
          .map((p) => p.lastEventAt)
          .sort((a, b) => b.getTime() - a.getTime())[0];
        for (const [to, firstName] of recipients) {
          await sendEmail('tracking-data-stopped', {
            to,
            data: {
              firstName,
              projectNames: alert.stalled.map((p) => p.name),
              lastEventDate: newestLastEvent?.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
              }),
              dashboardUrl,
            },
          });
          emailsSent++;
        }
        await db.project.updateMany({
          where: { id: { in: alert.stalled.map((p) => p.id) } },
          data: { dataStoppedNotifiedAt: new Date() },
        });
      }
    } catch (err) {
      logger.error(
        { err, organizationId: alert.organizationId },
        'Data-health alert failed'
      );
    }
  }

  logger.info(
    {
      projects: projects.length,
      organizations: byOrg.size,
      emailsSent,
    },
    'Data-health check complete'
  );
}
