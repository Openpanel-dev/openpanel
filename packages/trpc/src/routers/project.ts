// Dissolved into @openpanel/core's project module (M6-002): the CRUD and
// mutation bodies moved to
// packages/core/src/modules/project/project.service.ts. This router stays
// (DELEGATE PATTERN) — it keeps V1's protectedProcedure stack (session/
// access/logger/rate-limit middleware) and delegates every handler body to
// core's project functions, same as organization's router does (M6-001).
import {
  cancelProjectDeletion,
  createProjectForOrganization,
  getProjectActivationStatus,
  getProjectById,
  getProjects,
  getProjectWithClients,
  scheduleProjectDeletion,
  updateProjectForOrganization,
} from '@openpanel/core';
import { zOnboardingProject, zProjectUpdate } from '@openpanel/validation';
import { z } from 'zod';
import {
  getOrganizationAccess,
  getProjectAccess,
  requireProjectAccess,
  requireProjectAdmin,
} from '../access';
import { TRPCBadRequestError, TRPCForbiddenError } from '../errors';
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

      return getProjectActivationStatus(projectId);
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

      const project = await getProjectById(input.id);
      if (!project) {
        throw new TRPCForbiddenError('Project not found');
      }

      return updateProjectForOrganization(input.id, project.organizationId, {
        name: input.name,
        domain: input.domain,
        cors: input.cors,
        crossDomain: input.crossDomain,
        allowUnsafeRevenueTracking: input.allowUnsafeRevenueTracking,
      });
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
        throw new TRPCForbiddenError(
          'Only organization admins can create projects'
        );
      }

      const { project, client } = await createProjectForOrganization(
        input.organizationId,
        {
          name: input.project,
          domain: input.domain,
          cors: input.cors,
          crossDomain: false,
          types: [],
        }
      );

      return { ...project, client };
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

      await scheduleProjectDeletion(input.projectId);

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

      await cancelProjectDeletion(input.projectId);

      return true;
    }),
});
