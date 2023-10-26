import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { getProjectBySlug } from "@/server/services/project.service";



export const dashboardRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        organizationSlug: z.string(),
        projectSlug: z.string(),
      }),
    )
    .query(async ({ input: { projectSlug } }) => {
      const project = await getProjectBySlug(projectSlug)
      return db.dashboard.findMany({
        where: {
          project_id: project.id,
        },
      });
    }),
});
