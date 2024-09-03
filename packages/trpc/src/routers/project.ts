import { z } from 'zod';

import { db, getId, getProjectsByOrganizationSlug } from '@openpanel/db';

import { getProjectAccess } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const projectRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        organizationSlug: z.string().nullable(),
      })
    )
    .query(async ({ input: { organizationSlug } }) => {
      if (organizationSlug === null) return [];
      return getProjectsByOrganizationSlug(organizationSlug);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: input.id,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

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
        organizationSlug: z.string(),
      })
    )
    .mutation(async ({ input: { name, organizationSlug } }) => {
      return db.project.create({
        data: {
          id: await getId('project', name),
          organizationSlug: organizationSlug,
          organizationId: organizationSlug,
          name: name,
        },
      });
    }),
  remove: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: input.id,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      await db.project.delete({
        where: {
          id: input.id,
        },
      });
      return true;
    }),
});
