import { randomUUID } from 'crypto';
import { clerkClient } from '@clerk/fastify';

import { hashPassword, slug, stripTrailingSlash } from '@openpanel/common';
import { db, getId } from '@openpanel/db';
import type { ProjectType } from '@openpanel/db';
import { zOnboardingProject } from '@openpanel/validation';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const onboardingRouter = createTRPCRouter({
  project: protectedProcedure
    .input(zOnboardingProject)
    .mutation(async ({ input, ctx }) => {
      const types: ProjectType[] = [];
      if (input.website) types.push('website');
      if (input.app) types.push('app');
      if (input.backend) types.push('backend');

      const organization = await clerkClient.organizations.createOrganization({
        name: input.organization,
        slug: slug(input.organization),
        createdBy: ctx.session.userId,
      });

      if (!organization.slug) {
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

      ctx.setCookie('onboarding_client_secret', secret, {
        maxAge: 60 * 60, // 1 hour
        path: '/',
      });

      return {
        ...client,
        secret,
      };
    }),
});
