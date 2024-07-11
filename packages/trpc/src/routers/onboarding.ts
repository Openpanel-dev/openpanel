import crypto from 'crypto';
import type { z } from 'zod';

import { hashPassword, stripTrailingSlash } from '@openpanel/common';
import { db, getId, getOrganizationBySlug, getUserById } from '@openpanel/db';
import type { ProjectType } from '@openpanel/db';
import { zOnboardingProject } from '@openpanel/validation';

import { createTRPCRouter, protectedProcedure } from '../trpc';

async function createOrGetOrganization(
  input: z.infer<typeof zOnboardingProject>,
  userId: string
) {
  if (input.organizationSlug) {
    return await getOrganizationBySlug(input.organizationSlug);
  }

  if (input.organization) {
    return db.organization.create({
      data: {
        id: await getId('organization', input.organization),
        name: input.organization,
        createdByUserId: userId,
      },
    });
  }

  return null;
}

export const onboardingRouter = createTRPCRouter({
  skipOnboardingCheck: protectedProcedure.query(async ({ ctx }) => {
    const members = await db.member.findMany({
      where: {
        userId: ctx.session.userId,
      },
    });

    if (members.length > 0) {
      return {
        canSkip: true,
        url: `/${members[0]?.organizationId}`,
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
        url: `/${projectAccess[0]?.organizationId}/${projectAccess[0]?.projectId}`,
      };
    }

    return { canSkip: false, url: null };
  }),
  project: protectedProcedure
    .input(zOnboardingProject)
    .mutation(async ({ input, ctx }) => {
      const types: ProjectType[] = [];
      if (input.website) types.push('website');
      if (input.app) types.push('app');
      if (input.backend) types.push('backend');

      const [organization, user] = await Promise.all([
        createOrGetOrganization(input, ctx.session.userId),
        getUserById(ctx.session.userId),
      ]);

      if (!organization?.id) {
        throw new Error('Organization slug is missing');
      }

      await db.member.create({
        data: {
          email: user.email,
          organizationId: organization.id,
          role: 'org:admin',
          userId: user.id,
        },
      });

      const project = await db.project.create({
        data: {
          id: await getId('project', input.project),
          name: input.project,
          organizationSlug: organization.id,
          organizationId: organization.id,
          types,
        },
      });

      const secret = `sec_${crypto.randomBytes(10).toString('hex')}`;
      const client = await db.client.create({
        data: {
          name: `${project.name} Client`,
          organizationSlug: organization.id,
          organizationId: organization.id,
          projectId: project.id,
          type: 'write',
          cors: input.domain ? stripTrailingSlash(input.domain) : null,
          secret: await hashPassword(secret),
        },
      });

      return {
        ...client,
        secret,
      };
    }),
});
