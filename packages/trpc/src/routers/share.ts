import ShortUniqueId from 'short-unique-id';

import { db } from '@openpanel/db';
import { zShareOverview } from '@openpanel/validation';

import { createTRPCRouter, protectedProcedure } from '../trpc';

const uid = new ShortUniqueId({ length: 6 });

export const shareRouter = createTRPCRouter({
  shareOverview: protectedProcedure
    .input(zShareOverview)
    .mutation(async ({ input }) => {
      return db.shareOverview.upsert({
        where: {
          projectId: input.projectId,
        },
        create: {
          id: uid.rnd(),
          organizationId: input.organizationId,
          projectId: input.projectId,
          public: input.public,
          password: input.password || null,
        },
        update: {
          public: input.public,
          password: input.password,
        },
      });
    }),
});
