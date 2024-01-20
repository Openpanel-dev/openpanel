import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { db } from '@/server/db';
import { z } from 'zod';

export const profileRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        query: z.string().nullable(),
        projectId: z.string(),
        take: z.number().default(100),
        skip: z.number().default(0),
      })
    )
    .query(async ({ input: { take, skip, projectId, query } }) => {
      return db.profile.findMany({
        take,
        skip,
        where: {
          project_id: projectId,
          ...(query
            ? {
                OR: [
                  {
                    first_name: {
                      contains: query,
                      mode: 'insensitive',
                    },
                  },
                  {
                    last_name: {
                      contains: query,
                      mode: 'insensitive',
                    },
                  },
                  {
                    email: {
                      contains: query,
                      mode: 'insensitive',
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }),
  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ input: { id } }) => {
      return db.profile.findUniqueOrThrow({
        where: {
          id,
        },
      });
    }),
});
