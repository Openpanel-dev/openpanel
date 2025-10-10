import ShortUniqueId from 'short-unique-id';

import { db } from '@openpanel/db';
import { zShareOverview } from '@openpanel/validation';

import { hashPassword } from '@openpanel/auth';
import { z } from 'zod';
import { TRPCNotFoundError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const uid = new ShortUniqueId({ length: 6 });

export const shareRouter = createTRPCRouter({
  overview: protectedProcedure
    .input(
      z
        .object({
          projectId: z.string(),
        })
        .or(
          z.object({
            shareId: z.string(),
          }),
        ),
    )
    .query(async ({ input, ctx }) => {
      const share = await db.shareOverview.findUnique({
        include: {
          organization: {
            select: {
              name: true,
            },
          },
          project: {
            select: {
              name: true,
            },
          },
        },
        where:
          'projectId' in input
            ? {
                projectId: input.projectId,
              }
            : {
                id: input.shareId,
              },
      });

      if (!share) {
        throw TRPCNotFoundError('Share not found');
      }

      return {
        ...share,
        hasAccess: !!ctx.cookies[`shared-overview-${share?.id}`],
      };
    }),
  createOverview: protectedProcedure
    .input(zShareOverview)
    .mutation(async ({ input }) => {
      const passwordHash = input.password
        ? await hashPassword(input.password)
        : null;

      return db.shareOverview.upsert({
        where: {
          projectId: input.projectId,
        },
        create: {
          id: uid.rnd(),
          organizationId: input.organizationId,
          projectId: input.projectId,
          public: input.public,
          password: passwordHash,
        },
        update: {
          public: input.public,
          password: passwordHash,
        },
      });
    }),
});
