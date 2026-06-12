import type { Job } from 'bullmq';
import { differenceInDays, format } from 'date-fns';

import { db, getOrganizationEventsCount } from '@openpanel/db';
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
    projects: {
      select: {
        id: true,
      },
    },
  },
} as const;

type OrgWithCreator = Awaited<
  ReturnType<typeof db.organization.findMany<typeof orgQuery>>
>[number];

type OnboardingUsage = {
  eventsCount: number;
  hasData: boolean;
};

type OnboardingContext = {
  org: OrgWithCreator;
  user: NonNullable<OrgWithCreator['createdBy']>;
  // Lazy + memoized: only emails past the day gate pay for the ClickHouse count.
  getUsage: () => Promise<OnboardingUsage>;
};

type OnboardingEmail<T extends EmailTemplate = EmailTemplate> = {
  day: number;
  template: T;
  shouldSend?: (ctx: OnboardingContext) => Promise<boolean | 'complete'>;
  data: (ctx: OnboardingContext) => EmailData<T> | Promise<EmailData<T>>;
};

// Helper to create type-safe email entries with correlated template/data types
function email<T extends EmailTemplate>(config: OnboardingEmail<T>) {
  return config;
}

function createUsageGetter(org: OrgWithCreator) {
  let promise: Promise<OnboardingUsage> | null = null;
  return () => {
    promise ??= getOrganizationEventsCount(
      org.projects.map((project) => project.id),
    ).then((eventsCount) => ({
      eventsCount,
      hasData: eventsCount > 0,
    }));
    return promise;
  };
}

const getters = {
  firstName: (ctx: OnboardingContext) => ctx.user.firstName || undefined,
  dashboardUrl: (ctx: OnboardingContext) => {
    return `${process.env.DASHBOARD_URL}/${ctx.org.id}`;
  },
  billingUrl: (ctx: OnboardingContext) => {
    return `${process.env.DASHBOARD_URL}/${ctx.org.id}/billing`;
  },
  trialEndDate: (ctx: OnboardingContext) => {
    return ctx.org.subscriptionEndsAt
      ? format(ctx.org.subscriptionEndsAt, 'MMMM d')
      : undefined;
  },
  recommendedPlan: async (ctx: OnboardingContext) => {
    const { eventsCount } = await ctx.getUsage();
    return getRecommendedPlan(
      eventsCount,
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
    data: async (ctx) => ({
      firstName: getters.firstName(ctx),
      dashboardUrl: getters.dashboardUrl(ctx),
      hasData: (await ctx.getUsage()).hasData,
    }),
  }),
  email({
    day: 2,
    template: 'onboarding-what-to-track',
    data: async (ctx) => {
      const usage = await ctx.getUsage();
      return {
        firstName: getters.firstName(ctx),
        hasData: usage.hasData,
        eventsCount: usage.eventsCount,
      };
    },
  }),
  email({
    day: 6,
    template: 'onboarding-dashboards',
    data: async (ctx) => {
      const usage = await ctx.getUsage();
      return {
        firstName: getters.firstName(ctx),
        dashboardUrl: getters.dashboardUrl(ctx),
        hasData: usage.hasData,
        eventsCount: usage.eventsCount,
      };
    },
  }),
  email({
    day: 14,
    template: 'onboarding-feature-request',
    data: async (ctx) => ({
      firstName: getters.firstName(ctx),
      hasData: (await ctx.getUsage()).hasData,
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
    data: async (ctx) => {
      const usage = await ctx.getUsage();
      return {
        firstName: getters.firstName(ctx),
        billingUrl: getters.billingUrl(ctx),
        recommendedPlan: await getters.recommendedPlan(ctx),
        trialEndDate: getters.trialEndDate(ctx),
        hasData: usage.hasData,
        eventsCount: usage.eventsCount,
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
    data: async (ctx) => {
      const usage = await ctx.getUsage();
      return {
        firstName: getters.firstName(ctx),
        billingUrl: getters.billingUrl(ctx),
        recommendedPlan: await getters.recommendedPlan(ctx),
        hasData: usage.hasData,
        eventsCount: usage.eventsCount,
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
    const ctx: OnboardingContext = {
      org,
      user,
      getUsage: createUsageGetter(org),
    };
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
      {
        daysSinceOrgCreation,
        nextEmailDay: nextEmail.day,
        orgCreatedAt: org.createdAt,
        today: new Date(),
      },
      `Checking if enough days have passed for organization ${org.id}`,
    );
    // Check if enough days have passed
    if (daysSinceOrgCreation < nextEmail.day) {
      orgsSkipped++;
      continue;
    }

    // Check shouldSend callback if defined
    if (nextEmail.shouldSend) {
      const result = await nextEmail.shouldSend(ctx);

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
      const emailData = await nextEmail.data(ctx);

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
        { err: error, template: nextEmail.template },
        `Failed to send onboarding email to organization ${org.id}`,
      );
    }
  }

  logger.info(
    {
      totalOrgs: orgs.length,
      emailsSent,
      orgsCompleted,
      orgsSkipped,
    },
    'Completed onboarding email job',
  );

  return {
    totalOrgs: orgs.length,
    emailsSent,
    orgsCompleted,
    orgsSkipped,
  };
}
