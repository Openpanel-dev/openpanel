import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { getProjectBySlug } from "@/server/services/project.service";
import { slug } from "@/utils/slug";

export const dashboardRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          projectSlug: z.string(),
        })
        .or(
          z.object({
            projectId: z.string(),
          }),
        ),
    )
    .query(async ({ input }) => {
      let projectId = null;
      if ("projectId" in input) {
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
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input: { projectId, name } }) => {
      return db.dashboard.create({
        data: {
          slug: slug(name),
          project_id: projectId,
          name,
        },
      });
    }),
});
