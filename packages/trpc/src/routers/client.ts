import { randomUUID } from 'crypto';
import { z } from 'zod';

import { hashPassword, stripTrailingSlash } from '@openpanel/common';
import type { Prisma } from '@openpanel/db';
import { db } from '@openpanel/db';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const clientRouter = createTRPCRouter({
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
        cors: z.string().nullable(),
      })
    )
    .mutation(({ input }) => {
      return db.client.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
          cors: input.cors ?? null,
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
        type: z.enum(['read', 'write', 'root']).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const secret = randomUUID();
      const data: Prisma.ClientCreateArgs['data'] = {
        organizationSlug: input.organizationSlug,
        organizationId: input.organizationSlug,
        projectId: input.projectId,
        name: input.name,
        type: input.type ?? 'write',
        cors: input.cors ? stripTrailingSlash(input.cors) : null,
        secret: await hashPassword(secret),
      };

      const client = await db.client.create({ data });

      return {
        ...client,
        secret,
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
