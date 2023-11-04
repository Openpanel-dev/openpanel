import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { db } from '@/server/db';
import { getOrganizationBySlug } from '@/server/services/organization.service';
import { getProjectBySlug } from '@/server/services/project.service';
import { z } from 'zod';

export const projectRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        organizationSlug: z.string(),
      })
    )
    .query(async ({ input }) => {
      const organization = await getOrganizationBySlug(input.organizationSlug);
      return db.project.findMany({
        where: {
          organization_id: organization.id,
        },
      });
    }),
  get: protectedProcedure
    .input(
      z
        .object({
          id: z.string(),
        })
        .or(z.object({ slug: z.string() }))
    )
    .query(({ input }) => {
      if ('slug' in input) {
        return getProjectBySlug(input.slug);
      }

      return db.project.findUniqueOrThrow({
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
        name: z.string(),
        organizationSlug: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const organization = await getOrganizationBySlug(input.organizationSlug);
      return db.project.create({
        data: {
          organization_id: organization.id,
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
