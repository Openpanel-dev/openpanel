import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { db } from '@/server/db';
import { getDashboardBySlug } from '@/server/services/dashboard.service';
import { getProjectBySlug } from '@/server/services/project.service';
import { slug } from '@/utils/slug';
import { z } from 'zod';

export const dashboardRouter = createTRPCRouter({
  get: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
      })
    )
    .query(async ({ input: { slug } }) => {
      return getDashboardBySlug(slug);
    }),
  list: protectedProcedure
    .input(
      z
        .object({
          projectSlug: z.string(),
        })
        .or(
          z.object({
            projectId: z.string(),
          })
        )
    )
    .query(async ({ input }) => {
      let projectId = null;
      if ('projectId' in input) {
        projectId = input.projectId;
      } else {
        projectId = (await getProjectBySlug(input.projectSlug)).id;
      }

      return db.dashboard.findMany({
        where: {
          project_id: projectId,
        },
      });
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        projectSlug: z.string(),
      })
    )
    .mutation(async ({ input: { projectSlug, name } }) => {
      const project = await getProjectBySlug(projectSlug);
      return db.dashboard.create({
        data: {
          slug: slug(name),
          project_id: project.id,
          name,
        },
      });
    }),
});
