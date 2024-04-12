import { randomUUID } from 'crypto';
import { createTRPCRouter, protectedProcedure } from '@/trpc/api/trpc';
import { clerkClient } from '@clerk/nextjs';
import { z } from 'zod';

import { hashPassword, stripTrailingSlash } from '@openpanel/common';
import { db, transformOrganization } from '@openpanel/db';

export const onboardingRouter = createTRPCRouter({
  organziation: protectedProcedure
    .input(
      z.object({
        organization: z.string(),
        project: z.string(),
        cors: z.string().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const org = await clerkClient.organizations.createOrganization({
        name: input.organization,
        createdBy: ctx.session.userId,
      });

      if (org.slug) {
        const project = await db.project.create({
          data: {
            name: input.project,
            organizationSlug: org.slug,
          },
        });

        const secret = randomUUID();
        const client = await db.client.create({
          data: {
            name: `${project.name} Client`,
            organizationSlug: org.slug,
            projectId: project.id,
            type: 'write',
            cors: input.cors ? stripTrailingSlash(input.cors) : null,
            secret: await hashPassword(secret),
          },
        });

        return {
          client: {
            ...client,
            secret,
          },
          project,
          organization: transformOrganization(org),
        };
      }

      return {
        client: null,
        project: null,
        organization: org,
      };
    }),
});
