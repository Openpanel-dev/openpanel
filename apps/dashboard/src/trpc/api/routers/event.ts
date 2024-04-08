import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '@/trpc/api/trpc';
import { escape } from 'sqlstring';
import { z } from 'zod';

import { chQuery, convertClickhouseDateToJs, db } from '@openpanel/db';

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
          name_projectId: {
            name,
            projectId,
          },
        },
        create: { projectId, name, icon, color, conversion },
        update: { icon, color, conversion },
      });
    }),

  bots: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        limit: z.number().default(8),
      })
    )
    .query(async ({ input: { projectId, cursor, limit } }) => {
      const [events, counts] = await Promise.all([
        chQuery<{
          id: string;
          project_id: string;
          name: string;
          type: string;
          path: string;
          created_at: string;
        }>(
          `SELECT * FROM events_bots WHERE project_id = ${escape(projectId)} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${(cursor ?? 0) * limit}`
        ),
        chQuery<{
          count: number;
        }>(
          `SELECT count(*) as count FROM events_bots WHERE project_id = ${escape(projectId)}`
        ),
      ]);

      return {
        data: events.map((item) => ({
          ...item,
          createdAt: convertClickhouseDateToJs(item.created_at),
        })),
        count: counts[0]?.count ?? 0,
      };
    }),
});
