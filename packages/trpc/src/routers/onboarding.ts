import crypto from 'node:crypto';
import type { z } from 'zod';

import { stripTrailingSlash } from '@openpanel/common';
import { db, getId, getOrganizationById, getUserById } from '@openpanel/db';
import type { IServiceUser, ProjectType } from '@openpanel/db';
import { zOnboardingProject } from '@openpanel/validation';

import { hashPassword } from '@openpanel/common/server';
import { addDays } from 'date-fns';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

async function createOrGetOrganization(
  input: z.infer<typeof zOnboardingProject>,
  user: IServiceUser,
) {
  if (input.organizationId) {
    return await getOrganizationById(input.organizationId);
  }

  const TRIAL_DURATION_IN_DAYS = 30;
  // Generous trial allowance so trialing orgs never get flagged as
  // "limit exceeded" (the limit defaults to 0, which trips on the first event).
  const TRIAL_EVENTS_LIMIT = 10_000_000;

  if (input.organization) {
    const organizationId = await getId('organization', input.organization);

    // Create the organization and its owner (org:admin member) atomically. The
    // `delete` cron treats an organization with no org:admin member as ownerless
    // and removes it, so an organization must never exist without one.
    const [organization] = await db.$transaction([
      db.organization.create({
        data: {
          id: organizationId,
          name: input.organization,
          createdByUserId: user.id,
          subscriptionEndsAt: addDays(new Date(), TRIAL_DURATION_IN_DAYS),
          subscriptionStatus: 'trialing',
          subscriptionPeriodEventsLimit: TRIAL_EVENTS_LIMIT,
          timezone: input.timezone,
          onboarding: '',
        },
      }),
      db.member.create({
        data: {
          email: user.email,
          organizationId,
          role: 'org:admin',
          userId: user.id,
        },
      }),
    ]);

    return organization;
  }

  return null;
}

export const onboardingRouter = createTRPCRouter({
  skipOnboardingCheck: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.session.userId) {
      return { canSkip: false, url: null };
    }

    const members = await db.member.findMany({
      where: {
        userId: ctx.session.userId,
      },
    });

    if (members.length > 0) {
      return {
        canSkip: true,
      };
    }

    const projectAccess = await db.projectAccess.findMany({
      where: {
        userId: ctx.session.userId,
      },
    });

    if (projectAccess.length > 0) {
      return {
        canSkip: true,
      };
    }

    return { canSkip: false };
  }),
  project: protectedProcedure
    .input(zOnboardingProject)
    .mutation(async ({ input, ctx }) => {
      const types: ProjectType[] = [];
      if (input.website) types.push('website');
      if (input.app) types.push('app');
      if (input.backend) types.push('backend');

      const user = await getUserById(ctx.session.userId);
      const organization = await createOrGetOrganization(input, user);

      if (!organization?.id) {
        throw new Error('Organization slug is missing');
      }

      if (input.cors.length === 0 && input.website) {
        input.cors.push('*');
      }

      const project = await db.project.create({
        data: {
          id: await getId('project', input.project),
          name: input.project,
          organizationId: organization.id,
          types,
          domain: input.domain ? stripTrailingSlash(input.domain) : null,
          cors: input.cors.map((c) => stripTrailingSlash(c)),
        },
      });

      const secret = `sec_${crypto.randomBytes(10).toString('hex')}`;
      const client = await db.client.create({
        data: {
          name: `${project.name} Client`,
          organizationId: organization.id,
          projectId: project.id,
          type: 'write',
          secret: await hashPassword(secret),
        },
      });

      return {
        ...client,
        secret,
      };
    }),
});
