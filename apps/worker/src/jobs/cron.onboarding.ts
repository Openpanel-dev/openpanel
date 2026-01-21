import type { Job } from 'bullmq';
import { differenceInDays } from 'date-fns';

import { db } from '@openpanel/db';
import {
  type EmailData,
  type EmailTemplate,
  sendEmail,
} from '@openpanel/email';
import type { CronQueuePayload } from '@openpanel/queue';

import { getRecommendedPlan } from '@openpanel/payments';
import { logger } from '../utils/logger';

// Types for the onboarding email system
const orgQuery = {
  include: {
    createdBy: {
      select: {
        id: true,
        email: true,
        firstName: true,
        deletedAt: true,
      },
    },
  },
} as const;

type OrgWithCreator = Awaited<
  ReturnType<typeof db.organization.findMany<typeof orgQuery>>
>[number];

type OnboardingContext = {
  org: OrgWithCreator;
  user: NonNullable<OrgWithCreator['createdBy']>;
};

type OnboardingEmail<T extends EmailTemplate = EmailTemplate> = {
  day: number;
  template: T;
  shouldSend?: (ctx: OnboardingContext) => Promise<boolean | 'complete'>;
  data: (ctx: OnboardingContext) => EmailData<T>;
};

// Helper to create type-safe email entries with correlated template/data types
function email<T extends EmailTemplate>(config: OnboardingEmail<T>) {
  return config;
}

const getters = {
  firstName: (ctx: OnboardingContext) => ctx.user.firstName || undefined,
  organizationName: (ctx: OnboardingContext) => ctx.org.name,
  dashboardUrl: (ctx: OnboardingContext) => {
    return `${process.env.DASHBOARD_URL}/${ctx.org.id}`;
  },
  billingUrl: (ctx: OnboardingContext) => {
    return `${process.env.DASHBOARD_URL}/${ctx.org.id}/billing`;
  },
  recommendedPlan: (ctx: OnboardingContext) => {
    return getRecommendedPlan(
      ctx.org.subscriptionPeriodEventsCount,
      (plan) =>
        `${plan.formattedEvents} events per month for ${plan.formattedPrice}`,
    );
  },
} as const;

// Declarative email schedule - easy to add, remove, or reorder
const ONBOARDING_EMAILS = [
  email({
    day: 0,
    template: 'onboarding-welcome',
    data: (ctx) => ({
      firstName: getters.firstName(ctx),
      dashboardUrl: getters.dashboardUrl(ctx),
    }),
  }),
  email({
    day: 2,
    template: 'onboarding-what-to-track',
    data: (ctx) => ({
      firstName: getters.firstName(ctx),
    }),
  }),
  email({
    day: 6,
    template: 'onboarding-dashboards',
    data: (ctx) => ({
      firstName: getters.firstName(ctx),
      dashboardUrl: getters.dashboardUrl(ctx),
    }),
  }),
  email({
    day: 14,
    template: 'onboarding-featue-request',
    data: (ctx) => ({
      firstName: getters.firstName(ctx),
    }),
  }),
  email({
    day: 26,
    template: 'onboarding-trial-ending',
    shouldSend: async ({ org }) => {
      if (org.subscriptionStatus === 'active') {
        return 'complete';
      }
      return true;
    },
    data: (ctx) => {
      return {
        firstName: getters.firstName(ctx),
        organizationName: getters.organizationName(ctx),
        billingUrl: getters.billingUrl(ctx),
        recommendedPlan: getters.recommendedPlan(ctx),
      };
    },
  }),
  email({
    day: 30,
    template: 'onboarding-trial-ended',
    shouldSend: async ({ org }) => {
      if (org.subscriptionStatus === 'active') {
        return 'complete';
      }
      return true;
    },
    data: (ctx) => {
      return {
        firstName: getters.firstName(ctx),
        billingUrl: getters.billingUrl(ctx),
        recommendedPlan: getters.recommendedPlan(ctx),
      };
    },
  }),
];

export async function onboardingJob(job: Job<CronQueuePayload>) {
  if (process.env.SELF_HOSTED === 'true') {
    return null;
  }

  logger.info('Starting onboarding email job');

  // Fetch organizations that are in onboarding (not completed)
  const orgs = await db.organization.findMany({
    where: {
      OR: [{ onboarding: null }, { onboarding: { notIn: ['completed'] } }],
      deleteAt: null,
      createdBy: {
        deletedAt: null,
      },
    },
    ...orgQuery,
  });

  logger.info(`Found ${orgs.length} organizations in onboarding`);

  let emailsSent = 0;
  let orgsCompleted = 0;
  let orgsSkipped = 0;

  for (const org of orgs) {
    // Skip if no creator or creator is deleted
    if (!org.createdBy || org.createdBy.deletedAt) {
      orgsSkipped++;
      continue;
    }

    const user = org.createdBy;
    const daysSinceOrgCreation = differenceInDays(new Date(), org.createdAt);

    // Find the next email to send
    // If org.onboarding is null or empty string, they haven't received any email yet
    const lastSentIndex = org.onboarding
      ? ONBOARDING_EMAILS.findIndex((e) => e.template === org.onboarding)
      : -1;
    const nextEmailIndex = lastSentIndex + 1;

    // No more emails to send
    if (nextEmailIndex >= ONBOARDING_EMAILS.length) {
      await db.organization.update({
        where: { id: org.id },
        data: { onboarding: 'completed' },
      });
      orgsCompleted++;
      logger.info(
        `Completed onboarding for organization ${org.id} (all emails sent)`,
      );
      continue;
    }

    const nextEmail = ONBOARDING_EMAILS[nextEmailIndex];
    if (!nextEmail) {
      continue;
    }

    logger.info(
      `Checking if enough days have passed for organization ${org.id}`,
      {
        daysSinceOrgCreation,
        nextEmailDay: nextEmail.day,
        orgCreatedAt: org.createdAt,
        today: new Date(),
      },
    );
    // Check if enough days have passed
    if (daysSinceOrgCreation < nextEmail.day) {
      orgsSkipped++;
      continue;
    }

    // Check shouldSend callback if defined
    if (nextEmail.shouldSend) {
      const result = await nextEmail.shouldSend({ org, user });

      if (result === 'complete') {
        await db.organization.update({
          where: { id: org.id },
          data: { onboarding: 'completed' },
        });
        orgsCompleted++;
        logger.info(
          `Completed onboarding for organization ${org.id} (shouldSend returned complete)`,
        );
        continue;
      }

      if (result === false) {
        orgsSkipped++;
        continue;
      }
    }

    try {
      const emailData = nextEmail.data({ org, user });

      await sendEmail(nextEmail.template, {
        to: user.email,
        data: emailData as never,
      });

      // Update onboarding to the template name we just sent
      await db.organization.update({
        where: { id: org.id },
        data: { onboarding: nextEmail.template },
      });

      emailsSent++;
      logger.info(
        `Sent onboarding email "${nextEmail.template}" to organization ${org.id} (user ${user.id})`,
      );
    } catch (error) {
      logger.error(
        `Failed to send onboarding email to organization ${org.id}`,
        {
          error,
          template: nextEmail.template,
        },
      );
    }
  }

  logger.info('Completed onboarding email job', {
    totalOrgs: orgs.length,
    emailsSent,
    orgsCompleted,
    orgsSkipped,
  });

  return {
    totalOrgs: orgs.length,
    emailsSent,
    orgsCompleted,
    orgsSkipped,
  };
}
