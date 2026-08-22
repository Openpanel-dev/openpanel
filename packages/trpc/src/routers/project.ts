import crypto from 'node:crypto';
import { stripTrailingSlash } from '@openpanel/common';
import { hashPassword } from '@openpanel/common/server';
import {
  db,
  getClientByIdCached,
  getId,
  getOrganizationAccess,
  getProjectByIdCached,
  getProjects,
  getProjectWithClients,
  type Prisma,
} from '@openpanel/db';
import { zOnboardingProject, zProjectUpdate } from '@openpanel/validation';
import { addHours } from 'date-fns';
import { z } from 'zod';
import {
  getProjectAccess,
  requireProjectAccess,
  requireProjectAdmin,
} from '../access';
import { TRPCForbiddenError, TRPCBadRequestError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const projectRouter = createTRPCRouter({
  getProjectWithClients: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(async ({ input: { projectId }, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      return getProjectWithClients(projectId);
    }),

  // Powers the activation checklist on the project overview: has the project
  // received data, built a report, and invited a teammate yet?
  activationStatus: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(async ({ input: { projectId }, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      const project = await db.project.findUniqueOrThrow({
        where: { id: projectId },
        select: {
          firstEventAt: true,
          eventsCount: true,
          organizationId: true,
          createdAt: true,
        },
      });

      const [reportCount, memberCount] = await Promise.all([
        db.report.count({ where: { projectId } }),
        db.member.count({
          where: { organizationId: project.organizationId },
        }),
      ]);

      return {
        // firstEventAt only exists for projects created after the column was
        // added; the lifetime counter covers everything older.
        hasFirstEvent: !!project.firstEventAt || project.eventsCount > 0,
        firstEventAt: project.firstEventAt,
        projectCreatedAt: project.createdAt,
        hasReport: reportCount > 0,
        hasTeammate: memberCount > 1,
      };
    }),

  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().nullable(),
      })
    )
    .query(async ({ input: { organizationId }, ctx }) => {
      if (organizationId === null) {
        return [];
      }
      return getProjects({
        organizationId,
        userId: ctx.session.userId,
      });
    }),

  update: protectedProcedure
    .input(zProjectUpdate)
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.id,
        level: 'write',
      });

      const res = await db.project.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
          crossDomain: input.crossDomain,
          allowUnsafeRevenueTracking: input.allowUnsafeRevenueTracking,
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
        ...res.clients.map((client) => getClientByIdCached.clear(client.id)),
      ]);
      return res;
    }),
  create: protectedProcedure
    .input(zOnboardingProject)
    .mutation(async ({ input, ctx }) => {
      if (!input.organizationId) {
        throw new TRPCBadRequestError('Organization is required');
      }

      const access = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: input.organizationId,
      });

      if (access?.role !== 'org:admin') {
        throw new TRPCForbiddenError('Only organization admins can create projects');
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
          allowUnsafeRevenueTracking: false,
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
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Destroying a project is admin-tier, matching project.create.
      await requireProjectAdmin({
        userId: ctx.session.userId,
        projectId: input.projectId,
        message: 'Only organization admins can delete projects',
      });

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
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireProjectAdmin({
        userId: ctx.session.userId,
        projectId: input.projectId,
        message: 'Only organization admins can cancel a project deletion',
      });

      const project = await db.project.findUnique({
        where: {
          id: input.projectId,
        },
        select: {
          organization: {
            select: {
              deleteAt: true,
            },
          },
        },
      });

      // If the whole organization is scheduled for deletion, this project's
      // deletion is part of it and can only be cancelled at the organization
      // level. Cancelling it here would leave the organization unable to delete.
      if (project?.organization?.deleteAt) {
        throw new TRPCBadRequestError(
          'This organization is scheduled for deletion. Cancel the deletion from the organization settings.',
        );
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
