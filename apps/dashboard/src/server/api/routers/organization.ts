import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { clerkClient } from '@clerk/nextjs';
import { z } from 'zod';

import { getOrganizationBySlug } from '@openpanel/db';
import { zInviteUser } from '@openpanel/validation';

export const organizationRouter = createTRPCRouter({
  list: protectedProcedure.query(() => {
    return clerkClient.organizations.getOrganizationList();
  }),
  // first: protectedProcedure.query(() => getCurrentOrganization()),
  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(({ input }) => {
      return getOrganizationBySlug(input.id);
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .mutation(({ input }) => {
      return clerkClient.organizations.updateOrganization(input.id, {
        name: input.name,
      });
    }),
  inviteUser: protectedProcedure
    .input(zInviteUser)
    .mutation(async ({ input, ctx }) => {
      const organization = await getOrganizationBySlug(input.organizationSlug);

      if (!organization) {
        throw new Error('Organization not found');
      }

      return clerkClient.organizations.createOrganizationInvitation({
        organizationId: organization.id,
        emailAddress: input.email,
        role: input.role,
        inviterUserId: ctx.session.userId,
      });
    }),
});
