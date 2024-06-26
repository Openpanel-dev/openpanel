import crypto from 'crypto';
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
        crossDomain: z.boolean().optional(),
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
          crossDomain: input.crossDomain,
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
        crossDomain: z.boolean().optional(),
        type: z.enum(['read', 'write', 'root']).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const secret = `sec_${crypto.randomBytes(10).toString('hex')}`;
      const data: Prisma.ClientCreateArgs['data'] = {
        organizationSlug: input.organizationSlug,
        organizationId: input.organizationSlug,
        projectId: input.projectId,
        name: input.name,
        type: input.type ?? 'write',
        cors: input.cors ? stripTrailingSlash(input.cors) : null,
        secret: await hashPassword(secret),
        crossDomain: input.crossDomain ?? false,
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
