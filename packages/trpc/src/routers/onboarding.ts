import { randomUUID } from 'crypto';
import { clerkClient } from '@clerk/fastify';
import type { z } from 'zod';

import { hashPassword, slug, stripTrailingSlash } from '@openpanel/common';
import { db, getId } from '@openpanel/db';
import type { ProjectType } from '@openpanel/db';
import { zOnboardingProject } from '@openpanel/validation';

import { createTRPCRouter, protectedProcedure } from '../trpc';

async function createOrGetOrganization(
  input: z.infer<typeof zOnboardingProject>,
  userId: string
) {
  if (input.organizationSlug) {
    return await clerkClient.organizations.getOrganization({
      slug: input.organizationSlug,
    });
  }

  if (input.organization) {
    return await clerkClient.organizations.createOrganization({
      name: input.organization,
      slug: slug(input.organization),
      createdBy: userId,
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

      if (!organization?.slug) {
        throw new Error('Organization slug is missing');
      }

      const project = await db.project.create({
        data: {
          id: await getId('project', input.project),
          name: input.project,
          organizationSlug: organization.slug,
          types,
        },
      });

      const secret = randomUUID();
      const client = await db.client.create({
        data: {
          name: `${project.name} Client`,
          organizationSlug: organization.slug,
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
