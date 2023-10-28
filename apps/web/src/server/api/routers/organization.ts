import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { getOrganizationBySlug } from "@/server/services/organization.service";
import { slug } from "@/utils/slug";

export const organizationRouter = createTRPCRouter({
  first: protectedProcedure.query(({ ctx }) => {
    return db.organization.findFirst({
      where: {
        users: {
          some: {
            id: ctx.session.user.id,
          },
        },
      },
    });
  }),
  get: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
      }),
    )
    .query(({ input }) => {
      return getOrganizationBySlug(input.slug)
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .mutation(({ input }) => {
      return db.organization.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
          slug: slug(input.name)
        },
      });
    }),
});
