import { randomUUID } from 'crypto';
import { createTRPCRouter, protectedProcedure } from '@/trpc/api/trpc';
import { z } from 'zod';

import { hashPassword, stripTrailingSlash } from '@openpanel/common';
import { db } from '@openpanel/db';

export const clientRouter = createTRPCRouter({
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
        cors: z.string(),
      })
    )
    .mutation(({ input }) => {
      return db.client.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
          cors: input.cors,
        },
      });
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        projectId: z.string(),
        organizationSlug: z.string(),
        cors: z.string().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const secret = randomUUID();
      const client = await db.client.create({
        data: {
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          name: input.name,
          secret: input.cors ? null : await hashPassword(secret),
          cors: input.cors ? stripTrailingSlash(input.cors) : '*',
        },
      });

      return {
        ...client,
        secret: input.cors ? null : secret,
      };
    }),
  remove: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await db.client.delete({
        where: {
          id: input.id,
        },
      });
      return true;
    }),
});
