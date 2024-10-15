import { clerkClient } from '@clerk/fastify';
import { pathOr } from 'ramda';
import { z } from 'zod';

import { db } from '@openpanel/db';
import { zInviteUser } from '@openpanel/validation';

import { getOrganizationAccess } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const organizationRouter = createTRPCRouter({
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.id,
      });

      if (access?.role !== 'org:admin') {
        throw TRPCAccessError('You do not have access to this project');
      }

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
      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationSlug,
      });

      if (access?.role !== 'org:admin') {
        throw TRPCAccessError('You do not have access to this project');
      }

      const email = input.email.toLowerCase();
      const userExists = await db.user.findFirst({
        where: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
      });

      let invitationId: string | undefined;

      if (!userExists) {
        const ticket = await clerkClient.invitations.createInvitation({
          emailAddress: email,
          notify: true,
        });
        invitationId = ticket.id;
      }

      return db.member.create({
        data: {
          email,
          organizationId: input.organizationSlug,
          role: input.role,
          invitedById: ctx.session.userId,
          meta: {
            access: input.access,
            invitationId,
          },
        },
      });
    }),
  revokeInvite: protectedProcedure
    .input(
      z.object({
        memberId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const member = await db.member.findUniqueOrThrow({
        where: {
          id: input.memberId,
        },
      });

      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: member.organizationId,
      });

      if (access?.role !== 'org:admin') {
        throw TRPCAccessError('You do not have access to this project');
      }

      const invitationId = pathOr<string | undefined>(
        undefined,
        ['meta', 'invitationId'],
        member,
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
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const exists = await db.member.count({
        where: {
          userId: input.userId,
          organizationId: input.organizationId,
        },
      });

      if (ctx.session.userId === input.userId && exists === 1) {
        throw new Error('You cannot remove yourself from the organization');
      }

      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });

      if (access?.role !== 'org:admin') {
        throw TRPCAccessError('You do not have access to this project');
      }

      await db.$transaction([
        db.member.delete({
          where: {
            id: input.id,
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
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.session.userId) {
        throw TRPCAccessError('You cannot update your own access');
      }

      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationSlug,
      });

      if (access?.role !== 'org:admin') {
        throw TRPCAccessError('You do not have access to this project');
      }

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
