// Ported from packages/trpc/src/routers/project.ts (M6-002).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).
//
// `ctx.services.project` carries this module's factory (M10-004).
//
// The project-access ladder itself is bound once, in auth.service.ts
// (M10-002); every procedure here reaches it through `ctx.services.auth`.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { TRPCAccessError, TRPCForbiddenError } from '../../rpc/errors';
import { zOnboardingProject } from '../onboarding/onboarding.constants';
import { zProjectUpdate } from './project.constants';

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const projectRouter = createTRPCRouter({
  getProjectWithClients: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const access = await ctx.services.auth.getProjectAccess({
        userId,
        projectId,
      });
      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }
      return ctx.services.project.getProjectWithClients(projectId);
    }),

  // Powers the activation checklist on the project overview: has the project
  // received data, built a report, and invited a teammate yet?
  activationStatus: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const access = await ctx.services.auth.getProjectAccess({
        userId,
        projectId,
      });
      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      return ctx.services.project.getProjectActivationStatus(projectId);
    }),

  list: protectedProcedure
    .input(z.object({ organizationId: z.string().nullable() }))
    .query(async ({ input: { organizationId }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      if (organizationId === null) {
        return [];
      }
      return ctx.services.project.getProjects({ organizationId, userId });
    }),

  update: protectedProcedure
    .input(zProjectUpdate)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.id,
        level: 'write',
      });

      const project = await ctx.services.project.getProjectById(input.id);
      if (!project) {
        throw new TRPCForbiddenError('Project not found');
      }

      return ctx.services.project.updateProjectForOrganization(
        input.id,
        project.organizationId,
        {
          name: input.name,
          domain: input.domain,
          cors: input.cors,
          crossDomain: input.crossDomain,
          allowUnsafeRevenueTracking: input.allowUnsafeRevenueTracking,
        }
      );
    }),

  create: protectedProcedure
    .input(zOnboardingProject)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      if (!input.organizationId) {
        throw new TRPCForbiddenError('Organization is required');
      }

      const access = await ctx.services.auth.getOrganizationAccess({
        userId,
        organizationId: input.organizationId,
      });

      if (access?.role !== 'org:admin') {
        throw new TRPCForbiddenError(
          'Only organization admins can create projects'
        );
      }

      const { project, client } =
        await ctx.services.project.createProjectForOrganization(
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
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      // Destroying a project is admin-tier, matching project.create.
      await ctx.services.auth.requireProjectAdmin({
        userId,
        projectId: input.projectId,
        message: 'Only organization admins can delete projects',
      });

      await ctx.services.project.scheduleProjectDeletion(input.projectId);
      return true;
    }),

  cancelDeletion: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await ctx.services.auth.requireProjectAdmin({
        userId,
        projectId: input.projectId,
        message: 'Only organization admins can cancel a project deletion',
      });

      await ctx.services.project.cancelProjectDeletion(input.projectId);
      return true;
    }),
});
