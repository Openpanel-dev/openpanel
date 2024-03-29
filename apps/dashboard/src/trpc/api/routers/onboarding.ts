import { randomUUID } from 'crypto';
import { createTRPCRouter, protectedProcedure } from '@/trpc/api/trpc';
import { clerkClient } from '@clerk/nextjs';
import { z } from 'zod';

import { hashPassword, stripTrailingSlash } from '@openpanel/common';
import {
  db,
  transformClient,
  transformOrganization,
  transformProject,
} from '@openpanel/db';

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
            organization_slug: org.slug,
          },
        });

        const secret = randomUUID();
        const client = await db.client.create({
          data: {
            name: `${project.name} Client`,
            organization_slug: org.slug,
            project_id: project.id,
            cors: input.cors ? stripTrailingSlash(input.cors) : '*',
            secret: input.cors ? null : await hashPassword(secret),
          },
        });

        return {
          client: transformClient({
            ...client,
            secret: input.cors ? null : secret,
          }),
          project: transformProject(project),
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
