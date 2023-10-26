import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { hashPassword } from "@/server/services/hash.service";
import { randomUUID } from "crypto";
import { getOrganizationBySlug } from "@/server/services/organization.service";

export const clientRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        organizationSlug: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const organization = await getOrganizationBySlug(input.organizationSlug);
      return db.client.findMany({
        where: {
          organization_id: organization.id,
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
      }),
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
      }),
    )
    .mutation(({ input }) => {
      return db.client.update({
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
        projectId: z.string(),
        organizationSlug: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const organization = await getOrganizationBySlug(input.organizationSlug);
      const secret = randomUUID();
      const client = await db.client.create({
        data: {
          organization_id: organization.id,
          project_id: input.projectId,
          name: input.name,
          secret: await hashPassword(secret),
        },
      });

      return {
        clientSecret: secret,
        clientId: client.id,
      };
    }),
  remove: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
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
