import { createTRPCRouter, protectedProcedure } from '@/trpc/api/trpc';
import { z } from 'zod';

import { db } from '@openpanel/db';

export const eventRouter = createTRPCRouter({
  updateEventMeta: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        icon: z.string().optional(),
        color: z.string().optional(),
        conversion: z.boolean().optional(),
      })
    )
    .mutation(({ input: { projectId, name, icon, color, conversion } }) => {
      return db.eventMeta.upsert({
        where: {
          name_project_id: {
            name,
            project_id: projectId,
          },
        },
        create: { project_id: projectId, name, icon, color, conversion },
        update: { icon, color, conversion },
      });
    }),
});
