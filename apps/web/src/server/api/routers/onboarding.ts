import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { clerkClient } from '@clerk/nextjs';
import { z } from 'zod';

import { db } from '@mixan/db';

export const onboardingRouter = createTRPCRouter({
  organziation: protectedProcedure
    .input(
      z.object({
        organization: z.string(),
        project: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const org = await clerkClient.organizations.createOrganization({
        name: input.organization,
        createdBy: ctx.session.userId,
      });

      if (org.slug && input.project) {
        const project = await db.project.create({
          data: {
            name: input.project,
            organization_slug: org.slug,
          },
        });

        return {
          project,
          organization: org,
        };
      }

      return {
        project: null,
        organization: org,
      };
    }),
});
