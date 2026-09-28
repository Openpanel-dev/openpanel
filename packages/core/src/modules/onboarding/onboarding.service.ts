// Every exported function takes `ServiceDeps` and reaches Postgres as
// `deps.db`, so the requestId minted at the edge reaches the query.

import crypto from 'node:crypto';
import { getRecommendedPlan } from '@openpanel/payments';
import { stripTrailingSlash } from '@openpanel/shared';
import { format } from 'date-fns';
import type { Logger } from '../../logger';
import type { ServiceDeps, Services } from '../../services';
import { hashClientSecret } from '../../shared/client-secret';
import { getId } from '../../slug-id';
import {
  runSequence,
  type SequenceStep,
  type SequenceSubject,
  step,
} from '../email/src/sequence';
import {
  getOrganizationById,
  getOrganizationEventsCount,
} from '../organization/organization.service';
import { getUserById } from '../user/user.service';
import type { IOnboardingProject } from './onboarding.constants';

const TRIAL_DURATION_IN_DAYS = 30;
// Generous trial allowance so trialing orgs never get flagged as
// "limit exceeded" (the limit defaults to 0, which trips on the first event).
const TRIAL_EVENTS_LIMIT = 10_000_000;

export async function canSkipOnboarding(
  deps: ServiceDeps,
  userId: string | null | undefined
): Promise<{ canSkip: boolean }> {
  if (!userId) {
    return { canSkip: false };
  }

  // Sequential, not Promise.all: the early return below skips the
  // projectAccess query entirely for any user with a membership, which a
  // parallel fetch would give up. Changing this trades a real
  // memberships-found saving for the all-false path's latency — a behavior
  // change, out of scope here.
  const db = deps.db;
  const members = await db.member.findMany({ where: { userId } });
  if (members.length > 0) {
    return { canSkip: true };
  }

  const projectAccess = await db.projectAccess.findMany({
    where: { userId },
  });
  return { canSkip: projectAccess.length > 0 };
}

async function createOrGetOnboardingOrganization(
  deps: ServiceDeps,
  input: IOnboardingProject,
  userId: string
) {
  if (input.organizationId) {
    return await getOrganizationById(deps, input.organizationId);
  }

  if (!input.organization) {
    return null;
  }

  const db = deps.db;
  const organizationId = await getId(deps, 'organization', input.organization);

  // Create the organization and its owner (org:admin member) atomically. The
  // `delete` cron treats an organization with no org:admin member as ownerless
  // and removes it, so an organization must never exist without one.
  const [organization] = await db.$transaction([
    db.organization.create({
      data: {
        id: organizationId,
        name: input.organization,
        createdByUserId: userId,
        subscriptionEndsAt: new Date(
          Date.now() + TRIAL_DURATION_IN_DAYS * 24 * 60 * 60 * 1000
        ),
        subscriptionStatus: 'trialing',
        subscriptionPeriodEventsLimit: TRIAL_EVENTS_LIMIT,
        timezone: input.timezone,
        onboarding: '',
      },
    }),
    db.member.create({
      data: {
        email: (await getUserById(deps, userId)).email,
        organizationId,
        role: 'org:admin',
        userId,
      },
    }),
  ]);

  return organization;
}

export interface CreateOnboardingProjectResult {
  id: string;
  name: string;
  organizationId: string;
  projectId: string | null;
  type: string;
  secret: string;
}

export async function createOnboardingProject(
  deps: ServiceDeps,
  input: IOnboardingProject,
  userId: string
): Promise<CreateOnboardingProjectResult> {
  const types: ('website' | 'app' | 'backend')[] = [];
  if (input.website) {
    types.push('website');
  }
  if (input.app) {
    types.push('app');
  }
  if (input.backend) {
    types.push('backend');
  }

  const organization = await createOrGetOnboardingOrganization(
    deps,
    input,
    userId
  );
  // Only the no-org-identified branch of createOrGetOnboardingOrganization
  // can produce this: the organizationId branch throws (findUniqueOrThrow)
  // rather than returning falsy, so `organization` is always non-null there.
  if (!organization) {
    throw new Error('Organization name or id is required');
  }

  const cors = [...input.cors];
  if (cors.length === 0 && input.website) {
    cors.push('*');
  }

  const db = deps.db;

  const project = await db.project.create({
    data: {
      id: await getId(deps, 'project', input.project),
      name: input.project,
      organizationId: organization.id,
      types,
      domain: input.domain ? stripTrailingSlash(input.domain) : null,
      cors: cors.map((c) => stripTrailingSlash(c)),
    },
  });

  const secret = `sec_${crypto.randomBytes(10).toString('hex')}`;
  const client = await db.client.create({
    data: {
      name: `${project.name} Client`,
      organizationId: organization.id,
      projectId: project.id,
      type: 'write',
      secret: await hashClientSecret(secret),
    },
  });

  return { ...client, secret };
}

// -----------------------------------------------------------------------
// The onboarding email drip cron. The `organization.onboarding` column
// stores the last sent step, and step names are equal to template names for
// historical reasons: in-flight orgs already hold those values. Renaming one
// strands every org sitting on it (the runner completes them rather than
// replaying the sequence, but they still stop early).
//
// Stops at day 26 — what happens after the trial expires belongs to the
// wind-down cron, anchored on expiry rather than signup.

interface OnboardingUsage {
  eventsCount: number;
  hasData: boolean;
}

interface OnboardingCronOrg {
  id: string;
  createdAt: Date;
  onboarding: string | null;
  subscriptionStatus: string | null;
  subscriptionEndsAt: Date | null;
  createdBy: {
    id: string;
    email: string;
    firstName: string | null;
    deletedAt: Date | null;
  } | null;
  projects: { id: string }[];
}

interface OnboardingContext {
  org: OnboardingCronOrg;
  user: NonNullable<OnboardingCronOrg['createdBy']>;
  dashboardUrl: string;
  // Lazy + memoized: only emails past the day gate pay for the ClickHouse count.
  getUsage: () => Promise<OnboardingUsage>;
}

function createUsageGetter(deps: ServiceDeps, org: OnboardingCronOrg) {
  let promise: Promise<OnboardingUsage> | null = null;
  return () => {
    promise ??= getOrganizationEventsCount(
      deps,
      org.projects.map((project) => project.id)
    ).then((eventsCount) => ({
      eventsCount,
      hasData: eventsCount > 0,
    }));
    return promise;
  };
}

// Split by sync/async so a call site's own code (awaited or not) is the
// type-level signal of which is which, instead of one object where only
// `recommendedPlan` happens to return a Promise.
const syncGetters = {
  firstName: (ctx: OnboardingContext) => ctx.user.firstName || undefined,
  dashboardUrl: (ctx: OnboardingContext) => {
    return `${ctx.dashboardUrl}/${ctx.org.id}`;
  },
  billingUrl: (ctx: OnboardingContext) => {
    return `${ctx.dashboardUrl}/${ctx.org.id}/billing`;
  },
  trialEndDate: (ctx: OnboardingContext) => {
    return ctx.org.subscriptionEndsAt
      ? format(ctx.org.subscriptionEndsAt, 'MMMM d')
      : undefined;
  },
} as const;

const asyncGetters = {
  recommendedPlan: async (ctx: OnboardingContext) => {
    const { eventsCount } = await ctx.getUsage();
    return getRecommendedPlan(
      eventsCount,
      (plan: { formattedEvents: string; formattedPrice: string }) =>
        `${plan.formattedEvents} events per month for ${plan.formattedPrice}`
    );
  },
} as const;

const ONBOARDING_EMAILS: SequenceStep<OnboardingContext>[] = [
  step<OnboardingContext, 'onboarding-welcome'>({
    day: 0,
    step: 'onboarding-welcome',
    template: 'onboarding-welcome',
    data: async (ctx) => ({
      firstName: syncGetters.firstName(ctx),
      dashboardUrl: syncGetters.dashboardUrl(ctx),
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
        firstName: syncGetters.firstName(ctx),
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
        firstName: syncGetters.firstName(ctx),
        dashboardUrl: syncGetters.dashboardUrl(ctx),
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
      firstName: syncGetters.firstName(ctx),
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
        firstName: syncGetters.firstName(ctx),
        billingUrl: syncGetters.billingUrl(ctx),
        recommendedPlan: await asyncGetters.recommendedPlan(ctx),
        trialEndDate: syncGetters.trialEndDate(ctx),
        hasData: usage.hasData,
        eventsCount: usage.eventsCount,
      };
    },
  }),
];

export type OnboardingCronLogger = Pick<Logger, 'info' | 'warn' | 'error'>;

export interface OnboardingCronSummary {
  totalOrgs: number;
  emailsSent: number;
  orgsCompleted: number;
  orgsSkipped: number;
}

export async function runOnboardingCron(
  deps: ServiceDeps,
  logger: OnboardingCronLogger
): Promise<OnboardingCronSummary | null> {
  if (deps.config.selfHosted) {
    return null;
  }

  logger.info('Starting onboarding email job');

  const db = deps.db;
  const orgs: OnboardingCronOrg[] = await db.organization.findMany({
    where: {
      OR: [{ onboarding: null }, { onboarding: { notIn: ['completed'] } }],
      deleteAt: null,
      createdBy: { deletedAt: null },
    },
    include: {
      createdBy: {
        select: { id: true, email: true, firstName: true, deletedAt: true },
      },
      projects: { select: { id: true } },
    },
  });

  logger.info(`Found ${orgs.length} organizations in onboarding`);

  const contactable = orgs.filter(
    (org) => org.createdBy && !org.createdBy.deletedAt
  );
  const withoutCreator = orgs.length - contactable.length;

  const subjects: SequenceSubject<OnboardingContext>[] = contactable.map(
    (org) => {
      const user = org.createdBy as NonNullable<OnboardingCronOrg['createdBy']>;
      return {
        id: org.id,
        email: user.email,
        anchor: org.createdAt,
        pointer: org.onboarding,
        ctx: {
          org,
          user,
          dashboardUrl: deps.config.dashboardUrl,
          getUsage: createUsageGetter(deps, org),
        },
      };
    }
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

  const summary: OnboardingCronSummary = {
    totalOrgs: orgs.length,
    emailsSent: result.emailsSent,
    orgsCompleted: result.completed,
    orgsSkipped: result.deferred + result.stepsSkipped + withoutCreator,
  };

  logger.info({ ...summary }, 'Completed onboarding email job');

  return summary;
}

/** Registered in `services.ts`. Closes over `deps.logger`, the same value
 *  `ctx.logger` is, so `ctx.services.onboarding.runOnboardingCron()` takes no
 *  arguments — same shape as organization's `runDeleteCron`, which needs no
 *  logger of its own at all. */
export function createOnboardingService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    runOnboardingCron: (): Promise<OnboardingCronSummary | null> =>
      runOnboardingCron(deps, deps.logger),
  };
}
