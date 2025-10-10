import ShortUniqueId from 'short-unique-id';

import { db } from '@openpanel/db';
import { zShareOverview } from '@openpanel/validation';

import { hashPassword } from '@openpanel/auth';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const uid = new ShortUniqueId({ length: 6 });

export const shareRouter = createTRPCRouter({
  overview: {
    get: protectedProcedure
      .input(
        z.object({
          projectId: z.string(),
        }),
      )
      .query(async ({ ctx, input }) => {
        return db.shareOverview.findUnique({
          where: {
            projectId: input.projectId,
          },
        });
      }),
  },
  shareOverview: protectedProcedure
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
