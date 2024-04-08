import { createTRPCRouter, protectedProcedure } from '@/trpc/api/trpc';
import ShortUniqueId from 'short-unique-id';

import { db } from '@openpanel/db';
import { zShareOverview } from '@openpanel/validation';

const uid = new ShortUniqueId({ length: 6 });

export const shareRouter = createTRPCRouter({
  shareOverview: protectedProcedure
    .input(zShareOverview)
    .mutation(({ input }) => {
      return db.shareOverview.upsert({
        where: {
          projectId: input.projectId,
        },
        create: {
          id: uid.rnd(),
          organizationSlug: input.organizationId,
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
