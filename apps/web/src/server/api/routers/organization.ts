import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import {
  getCurrentOrganization,
  getOrganizationBySlug,
} from '@/server/services/organization.service';
import { clerkClient } from '@clerk/nextjs';
import { z } from 'zod';

export const organizationRouter = createTRPCRouter({
  list: protectedProcedure.query(() => {
    return clerkClient.organizations.getOrganizationList();
  }),
  first: protectedProcedure.query(() => getCurrentOrganization()),
  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(({ input }) => {
      return getOrganizationBySlug(input.id);
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .mutation(({ input }) => {
      return clerkClient.organizations.updateOrganization(input.id, {
        name: input.name,
      });
    }),
});
