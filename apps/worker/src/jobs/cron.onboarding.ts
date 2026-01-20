import { differenceInDays } from 'date-fns';
import type { Job } from 'bullmq';

import { db } from '@openpanel/db';
import { sendEmail } from '@openpanel/email';
import type { CronQueuePayload } from '@openpanel/queue';

import { logger } from '../utils/logger';

const EMAIL_SCHEDULE = {
  1: 0, // Welcome email - Day 0
  2: 2, // What to track - Day 2
  3: 6, // Dashboards - Day 6
  4: 14, // Replace stack - Day 14
  5: 26, // Trial ending - Day 26
} as const;

export async function onboardingJob(job: Job<CronQueuePayload>) {
  logger.info('Starting onboarding email job');

  // Fetch organizations with their creators who are in onboarding
  const organizations = await db.organization.findMany({
    where: {
      createdByUserId: {
        not: null,
      },
      createdBy: {
        onboarding: {
          not: null,
          gte: 1,
          lte: 5,
        },
        deletedAt: null,
      },
    },
    include: {
      createdBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          onboarding: true,
        },
      },
    },
  });

  logger.info(`Found ${organizations.length} organizations with creators in onboarding`);

  let emailsSent = 0;
  let usersCompleted = 0;
  let usersSkipped = 0;

  for (const org of organizations) {
    if (!org.createdBy || !org.createdByUserId) {
      continue;
    }

    const user = org.createdBy;

    // Check if organization has active subscription
    if (org.subscriptionStatus === 'active') {
      // Stop onboarding for users with active subscriptions
      await db.user.update({
        where: { id: user.id },
        data: { onboarding: null },
      });
      usersCompleted++;
      logger.info(`Stopped onboarding for user ${user.id} (active subscription)`);
      continue;
    }

    if (!user.onboarding || user.onboarding < 1 || user.onboarding > 5) {
      continue;
    }

    // Use organization creation date instead of user registration date
    const daysSinceOrgCreation = differenceInDays(new Date(), org.createdAt);
    const requiredDays = EMAIL_SCHEDULE[user.onboarding as keyof typeof EMAIL_SCHEDULE];

    if (daysSinceOrgCreation < requiredDays) {
      usersSkipped++;
      continue;
    }

    const dashboardUrl = `${process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || 'https://dashboard.openpanel.dev'}/${org.id}`;
    const billingUrl = `${process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || 'https://dashboard.openpanel.dev'}/${org.id}/billing`;

    try {
      // Send appropriate email based on onboarding step
      switch (user.onboarding) {
        case 1: {
          // Welcome email
          await sendEmail('onboarding-welcome', {
            to: user.email,
            data: {
              firstName: user.firstName || undefined,
              dashboardUrl,
            },
          });
          break;
        }
        case 2: {
          // What to track email
          await sendEmail('onboarding-what-to-track', {
            to: user.email,
            data: {
              firstName: user.firstName || undefined,
            },
          });
          break;
        }
        case 3: {
          // Dashboards email
          await sendEmail('onboarding-dashboards', {
            to: user.email,
            data: {
              firstName: user.firstName || undefined,
              dashboardUrl,
            },
          });
          break;
        }
        case 4: {
          // Replace stack email
          await sendEmail('onboarding-replace-stack', {
            to: user.email,
            data: {
              firstName: user.firstName || undefined,
            },
          });
          break;
        }
        case 5: {
          // Trial ending email
          await sendEmail('onboarding-trial-ending', {
            to: user.email,
            data: {
              firstName: user.firstName || undefined,
              organizationName: org.name,
              billingUrl,
              recommendedPlan: undefined, // TODO: Calculate based on usage
            },
          });
          break;
        }
      }

      // Increment onboarding state
      const nextOnboardingState = user.onboarding + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          onboarding: nextOnboardingState > 5 ? null : nextOnboardingState,
        },
      });

      emailsSent++;
      logger.info(`Sent onboarding email ${user.onboarding} to user ${user.id} for org ${org.id}`);

      if (nextOnboardingState > 5) {
        usersCompleted++;
      }
    } catch (error) {
      logger.error(`Failed to send onboarding email to user ${user.id}`, {
        error,
        onboardingStep: user.onboarding,
        organizationId: org.id,
      });
    }
  }

  logger.info('Completed onboarding email job', {
    totalOrganizations: organizations.length,
    emailsSent,
    usersCompleted,
    usersSkipped,
  });
}
