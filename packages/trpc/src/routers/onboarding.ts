import { randomUUID } from 'crypto';
import type { z } from 'zod';

import { hashPassword, slug, stripTrailingSlash } from '@openpanel/common';
import { db, getId, getOrganizationBySlug } from '@openpanel/db';
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
        id: slug(input.organization),
        name: input.organization,
        createdByUserId: userId,
      },
    });
  }

  return null;
}

export const onboardingRouter = createTRPCRouter({
  project: protectedProcedure
    .input(zOnboardingProject)
    .mutation(async ({ input, ctx }) => {
      const types: ProjectType[] = [];
      if (input.website) types.push('website');
      if (input.app) types.push('app');
      if (input.backend) types.push('backend');

      const organization = await createOrGetOrganization(
        input,
        ctx.session.userId
      );

      if (!organization?.id) {
        throw new Error('Organization slug is missing');
      }

      const project = await db.project.create({
        data: {
          id: await getId('project', input.project),
          name: input.project,
          organizationSlug: organization.id,
          organizationId: organization.id,
          types,
        },
      });

      const secret = randomUUID();
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
