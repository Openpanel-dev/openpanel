import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { db, getId } from '@/server/db';
import { slug } from '@/utils/slug';
import { z } from 'zod';

export const projectRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().nullable(),
      })
    )
    .query(async ({ input: { organizationId } }) => {
      if (organizationId === null) return [];

      return db.project.findMany({
        where: {
          organization_slug: organizationId,
        },
      });
    }),
  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(({ input: { id } }) => {
      return db.project.findUniqueOrThrow({
        where: {
          id,
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .mutation(({ input }) => {
      return db.project.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
        },
      });
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        organizationId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      return db.project.create({
        data: {
          id: await getId('project', input.name),
          organization_slug: input.organizationId,
          name: input.name,
        },
      });
    }),
  remove: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await db.project.delete({
        where: {
          id: input.id,
        },
      });
      return true;
    }),
});
