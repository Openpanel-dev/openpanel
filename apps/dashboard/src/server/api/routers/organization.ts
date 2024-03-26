import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { clerkClient } from '@clerk/nextjs';
import { z } from 'zod';

import { db, getOrganizationBySlug } from '@openpanel/db';
import { zInviteUser } from '@openpanel/validation';

export const organizationRouter = createTRPCRouter({
  list: protectedProcedure.query(() => {
    return clerkClient.organizations.getOrganizationList();
  }),
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
        publicMetadata: {
          access: input.access,
        },
      });
    }),
  revokeInvite: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        invitationId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return clerkClient.organizations.revokeOrganizationInvitation({
        organizationId: input.organizationId,
        invitationId: input.invitationId,
        requestingUserId: ctx.session.userId,
      });
    }),

  updateMemberAccess: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        organizationSlug: z.string(),
        access: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      return db.$transaction([
        db.projectAccess.deleteMany({
          where: {
            user_id: input.userId,
            organization_slug: input.organizationSlug,
          },
        }),
        db.projectAccess.createMany({
          data: input.access.map((projectId) => ({
            user_id: input.userId,
            organization_slug: input.organizationSlug,
            project_id: projectId,
            level: 'read',
          })),
        }),
      ]);
    }),
});
