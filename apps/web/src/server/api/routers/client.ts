import { randomUUID } from 'crypto';
import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { db } from '@/server/db';
import { z } from 'zod';

import { hashPassword } from '@mixan/common';

export const clientRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
      })
    )
    .query(async ({ input: { organizationId } }) => {
      return db.client.findMany({
        where: {
          organization_slug: organizationId,
        },
        include: {
          project: true,
        },
      });
    }),
  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(({ input }) => {
      return db.client.findUniqueOrThrow({
        where: {
          id: input.id,
        },
      });
    }),
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
        organizationId: z.string(),
        withCors: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const secret = randomUUID();
      const client = await db.client.create({
        data: {
          organization_slug: input.organizationId,
          project_id: input.projectId,
          name: input.name,
          secret: input.withCors ? null : await hashPassword(secret),
        },
      });

      return {
        clientSecret: input.withCors ? null : secret,
        clientId: client.id,
        cors: client.cors,
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
