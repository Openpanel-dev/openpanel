import type { Job } from 'bullmq';
import { format } from 'date-fns';

import { db, getOrganizationEventsCount } from '@openpanel/db';
import type { CronQueuePayload } from '@openpanel/queue';

import { getRecommendedPlan } from '@openpanel/payments';
import {
  type SequenceStep,
  type SequenceSubject,
  runSequence,
  step,
} from './lib/email-sequence';
import { logger } from '../utils/logger';

/**
 * The getting-started drip, from signup to a few days before the trial ends.
 *
 * It stops at day 26. What happens *after* the trial expires belongs to
 * cron.wind-down.ts, which is anchored on the expiry rather than on signup —
 * see that file. The old day-30 'onboarding-trial-ended' step moved there as
 * 'wind-down-expired'.
 *
 * The `onboarding` column stores the last sent step, and step names are equal
 * to template names for historical reasons: in-flight orgs already hold those
 * values. Renaming one strands every org sitting on it (the runner completes
 * them rather than replaying the sequence, but they still stop early).
 */

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

interface OnboardingUsage {
  eventsCount: number;
  hasData: boolean;
};

interface OnboardingContext {
  org: OrgWithCreator;
  user: NonNullable<OrgWithCreator['createdBy']>;
  // Lazy + memoized: only emails past the day gate pay for the ClickHouse count.
  getUsage: () => Promise<OnboardingUsage>;
};

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

export const ONBOARDING_EMAILS: SequenceStep<OnboardingContext>[] = [
  step<OnboardingContext, 'onboarding-welcome'>({
    day: 0,
    step: 'onboarding-welcome',
    template: 'onboarding-welcome',
    data: async (ctx) => ({
      firstName: getters.firstName(ctx),
      dashboardUrl: getters.dashboardUrl(ctx),
      hasData: (await ctx.getUsage()).hasData,
    }),
  }),
  step<OnboardingContext, 'onboarding-what-to-track'>({
    day: 2,
    step: 'onboarding-what-to-track',
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
  step<OnboardingContext, 'onboarding-dashboards'>({
    day: 6,
    step: 'onboarding-dashboards',
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
  step<OnboardingContext, 'onboarding-feature-request'>({
    day: 14,
    step: 'onboarding-feature-request',
    template: 'onboarding-feature-request',
    data: async (ctx) => ({
      firstName: getters.firstName(ctx),
      hasData: (await ctx.getUsage()).hasData,
    }),
  }),
  step<OnboardingContext, 'onboarding-trial-ending'>({
    day: 26,
    step: 'onboarding-trial-ending',
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
];

export async function onboardingJob(_job: Job<CronQueuePayload>) {
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

  const contactable = orgs.filter(
    (org) => org.createdBy && !org.createdBy.deletedAt,
  );
  const withoutCreator = orgs.length - contactable.length;

  const subjects: SequenceSubject<OnboardingContext>[] = contactable.map(
    (org) => {
      const user = org.createdBy as NonNullable<OrgWithCreator['createdBy']>;
      return {
        id: org.id,
        email: user.email,
        anchor: org.createdAt,
        pointer: org.onboarding,
        ctx: { org, user, getUsage: createUsageGetter(org) },
      };
    },
  );

  const result = await runSequence({
    name: 'onboarding',
    steps: ONBOARDING_EMAILS,
    subjects,
    logger,
    onAdvance: async (subject, stepName) => {
      await db.organization.update({
        where: { id: subject.id },
        data: { onboarding: stepName },
      });
    },
    onComplete: async (subject) => {
      await db.organization.update({
        where: { id: subject.id },
        data: { onboarding: 'completed' },
      });
    },
  });

  const summary = {
    totalOrgs: orgs.length,
    emailsSent: result.emailsSent,
    orgsCompleted: result.completed,
    orgsSkipped: result.deferred + result.stepsSkipped + withoutCreator,
  };

  logger.info(summary, 'Completed onboarding email job');

  return summary;
}
