import { z } from 'zod';

import { connectUserToOrganization, db } from '@openpanel/db';
import { zEditOrganization, zInviteUser } from '@openpanel/validation';

import { generateSecureId } from '@openpanel/common/server/id';
import { sendEmail } from '@openpanel/email';
import { addDays } from 'date-fns';
import { getOrganizationAccess } from '../access';
import { TRPCAccessError, TRPCBadRequestError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const organizationRouter = createTRPCRouter({
  update: protectedProcedure
    .input(zEditOrganization)
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
          timezone: input.timezone,
        },
      });
    }),

  inviteUser: protectedProcedure
    .input(zInviteUser)
    .mutation(async ({ input, ctx }) => {
      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
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

      const alreadyMember = await db.member.findFirst({
        where: {
          userId: userExists?.id,
          organizationId: input.organizationId,
        },
      });

      if (alreadyMember && userExists) {
        throw TRPCBadRequestError(
          'User is already a member of the organization',
        );
      }

      const alreadyInvited = await db.invite.findFirst({
        where: {
          email,
          organizationId: input.organizationId,
        },
      });

      if (alreadyInvited) {
        throw TRPCBadRequestError(
          'User is already invited to the organization',
        );
      }

      const invite = await db.invite.create({
        data: {
          id: generateSecureId('invite'),
          email,
          organizationId: input.organizationId,
          role: input.role,
          createdById: ctx.session.userId,
          projectAccess: input.access || [],
          expiresAt: addDays(new Date(), 3),
        },
        include: {
          organization: {
            select: {
              name: true,
            },
          },
        },
      });

      if (userExists) {
        const member = await connectUserToOrganization({
          user: userExists,
          inviteId: invite.id,
        });

        return {
          type: 'is_member',
          member,
        };
      }

      await sendEmail('invite', {
        to: email,
        data: {
          url: `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/onboarding?inviteId=${invite.id}`,
          organizationName: invite.organization.name,
        },
      });

      return {
        type: 'is_invited',
        invite,
      };
    }),
  revokeInvite: protectedProcedure
    .input(
      z.object({
        inviteId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const invite = await db.invite.findUniqueOrThrow({
        where: {
          id: input.inviteId,
        },
      });

      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: invite.organizationId,
      });

      if (access?.role !== 'org:admin') {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.invite.delete({
        where: {
          id: input.inviteId,
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
        organizationId: z.string(),
        access: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.session.userId) {
        throw TRPCAccessError('You cannot update your own access');
      }

      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });

      if (access?.role !== 'org:admin') {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.$transaction([
        db.projectAccess.deleteMany({
          where: {
            userId: input.userId,
            organizationId: input.organizationId,
          },
        }),
        db.projectAccess.createMany({
          data: input.access.map((projectId) => ({
            userId: input.userId,
            organizationId: input.organizationId,
            projectId: projectId,
            level: 'read',
          })),
        }),
      ]);
    }),
});
