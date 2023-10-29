import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";

export const config = {
  api: {
    responseLimit: false,
  },
};

export const eventRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        projectSlug: z.string(),
        take: z.number().default(100),
        skip: z.number().default(0),
      }),
    )
    .query(async ({ input: { take, skip, projectSlug } }) => {
      const project = await db.project.findUniqueOrThrow({
        where: {
          slug: projectSlug,
        },
      });
      return db.event.findMany({
        take,
        skip,
        where: {
          project_id: project.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          profile: true,
        },
      });
    }),
});
