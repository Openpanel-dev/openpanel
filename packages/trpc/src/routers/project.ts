import { z } from 'zod';

import {
  db,
  getId,
  getProjectByIdCached,
  getProjectsByOrganizationId,
} from '@openpanel/db';

import { getProjectAccess } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const projectRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().nullable(),
      }),
    )
    .query(async ({ input: { organizationId } }) => {
      if (organizationId === null) return [];
      return getProjectsByOrganizationId(organizationId);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: input.id,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      const res = await db.project.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
        },
      });
      await getProjectByIdCached.clear(input.id);
      return res;
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        organizationId: z.string(),
      }),
    )
    .mutation(async ({ input: { name, organizationId } }) => {
      return db.project.create({
        data: {
          id: await getId('project', name),
          organizationId,
          name: name,
        },
      });
    }),
  remove: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
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
