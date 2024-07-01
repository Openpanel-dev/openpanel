import { clerkClient } from '@clerk/fastify';
import { pathOr } from 'ramda';
import { z } from 'zod';

import { db } from '@openpanel/db';
import { zInviteUser } from '@openpanel/validation';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const organizationRouter = createTRPCRouter({
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .mutation(({ input }) => {
      return db.organization.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
        },
      });
    }),

  inviteUser: protectedProcedure
    .input(zInviteUser)
    .mutation(async ({ input, ctx }) => {
      const ticket = await clerkClient.invitations.createInvitation({
        emailAddress: input.email,
        notify: true,
      });

      return db.member.create({
        data: {
          email: input.email,
          organizationId: input.organizationSlug,
          role: input.role,
          invitedById: ctx.session.userId,
          meta: {
            access: input.access,
            invitationId: ticket.id,
          },
        },
      });
    }),
  revokeInvite: protectedProcedure
    .input(
      z.object({
        memberId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const member = await db.member.findUniqueOrThrow({
        where: {
          id: input.memberId,
        },
      });
      const invitationId = pathOr<string | undefined>(
        undefined,
        ['meta', 'invitationId'],
        member
      );

      if (invitationId) {
        await clerkClient.invitations
          .revokeInvitation(invitationId)
          .catch(() => {
            // Ignore errors, this will throw if the invitation is already accepted
          });
      }

      return db.member.delete({
        where: {
          id: input.memberId,
        },
      });
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.session.userId === input.userId) {
        throw new Error('You cannot remove yourself from the organization');
      }

      await db.$transaction([
        db.member.deleteMany({
          where: {
            userId: input.userId,
            organizationId: input.organizationId,
          },
        }),
        db.projectAccess.deleteMany({
          where: {
            userId: input.userId,
            organizationId: input.organizationId,
          },
        }),
      ]);
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
            userId: input.userId,
            organizationId: input.organizationSlug,
          },
        }),
        db.projectAccess.createMany({
          data: input.access.map((projectId) => ({
            userId: input.userId,
            organizationSlug: input.organizationSlug,
            organizationId: input.organizationSlug,
            projectId: projectId,
            level: 'read',
          })),
        }),
      ]);
    }),
});
