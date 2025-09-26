import { z } from 'zod';

import crypto from 'node:crypto';
import { stripTrailingSlash } from '@openpanel/common';
import { hashPassword } from '@openpanel/common/server';
import {
  type Prisma,
  db,
  getClientById,
  getClientByIdCached,
  getId,
  getProjectByIdCached,
  getProjectsByOrganizationId,
} from '@openpanel/db';
import { zOnboardingProject, zProject } from '@openpanel/validation';
import { addDays, addHours } from 'date-fns';
import { getProjectAccess } from '../access';
import { TRPCAccessError, TRPCBadRequestError } from '../errors';
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
          filters:
            input.filters === undefined ? undefined : input.filters || [],
          domain:
            input.domain === undefined
              ? undefined
              : input.domain
                ? stripTrailingSlash(input.domain)
                : null,
          cors:
            input.cors === undefined
              ? undefined
              : input.cors.map((c) => stripTrailingSlash(c)) || [],
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
    .input(zOnboardingProject)
    .mutation(async ({ input }) => {
      if (!input.organizationId) {
        throw TRPCBadRequestError('Organization is required');
      }

      const secret = `sec_${crypto.randomBytes(10).toString('hex')}`;
      const data: Prisma.ClientCreateArgs['data'] = {
        organizationId: input.organizationId,
        name: 'First client',
        type: 'write',
        secret: await hashPassword(secret),
      };
      const project = await db.project.create({
        data: {
          id: await getId('project', input.project),
          organizationId: input.organizationId,
          name: input.project,
          domain: input.domain,
          cors: input.cors,
          crossDomain: false,
          filters: [],
          clients: {
            create: data,
          },
        },
        include: {
          clients: {
            select: {
              id: true,
            },
          },
        },
      });

      return {
        ...project,
        client: project.clients[0]
          ? {
              id: project.clients[0].id,
              secret,
            }
          : null,
      };
    }),
  delete: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      await db.project.update({
        where: {
          id: input.projectId,
        },
        data: {
          deleteAt: addHours(new Date(), 24),
        },
      });

      return true;
    }),
  cancelDeletion: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      await db.project.update({
        where: {
          id: input.projectId,
        },
        data: {
          deleteAt: null,
        },
      });

      return true;
    }),
});
