import { z } from 'zod';

import {
  db,
  getClientById,
  getClientByIdCached,
  getId,
  getProjectByIdCached,
  getProjectsByOrganizationId,
} from '@openpanel/db';

import { stripTrailingSlash } from '@openpanel/common';
import { zProject } from '@openpanel/validation';
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
    .input(zProject.partial())
    .mutation(async ({ input, ctx }) => {
      if (!input.id) {
        throw new Error('Project ID is required to update a project');
      }

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
          crossDomain: input.crossDomain,
          filters: input.filters,
          domain: input.domain ? stripTrailingSlash(input.domain) : null,
          cors: input.cors?.map((c) => stripTrailingSlash(c)) || [],
        },
        include: {
          clients: {
            select: {
              id: true,
            },
          },
        },
      });
      await Promise.all([
        getProjectByIdCached.clear(input.id),
        res.clients.map((client) => {
          getClientByIdCached.clear(client.id);
        }),
      ]);
      return res;
    }),
  create: protectedProcedure
    .input(
      zProject.omit({ id: true }).merge(
        z.object({
          organizationId: z.string(),
        }),
      ),
    )
    .mutation(async ({ input }) => {
      return db.project.create({
        data: {
          id: await getId('project', input.name),
          organizationId: input.organizationId,
          name: input.name,
          domain: input.domain,
          cors: input.cors,
          crossDomain: input.crossDomain,
          filters: [],
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
