import ShortUniqueId from 'short-unique-id';

import { db } from '@openpanel/db';
import { zShareDashboard, zShareOverview } from '@openpanel/validation';

import { hashPassword } from '@openpanel/auth';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const uid = new ShortUniqueId({ length: 6 });

export const shareRouter = createTRPCRouter({
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

  createDashboard: protectedProcedure
    .input(zShareDashboard)
    .mutation(async ({ input }) => {
      const passwordHash = input.password
        ? await hashPassword(input.password)
        : null;

      return db.shareDashboard.upsert({
        where: { dashboardId: input.dashboardId },
        create: {
          id: uid.rnd(),
          organizationId: input.organizationId,
          dashboardId: input.dashboardId,
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
