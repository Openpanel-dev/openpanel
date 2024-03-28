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
          project_id: input.projectId,
        },
        create: {
          id: uid.rnd(),
          organization_slug: input.organizationId,
          project_id: input.projectId,
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
