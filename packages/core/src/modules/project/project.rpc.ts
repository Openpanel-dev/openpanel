// Ported from packages/trpc/src/routers/project.ts (M6-002).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's project functions (DELEGATE
// PATTERN). `ctx.services.project` carries this module's factory the same
// as every other module now (M10-004).
//
// The project-access ladder itself is bound once, in auth.service.ts
// (M10-002); every procedure here reaches it through `ctx.services.auth`.

import { zOnboardingProject, zProjectUpdate } from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError, TRPCForbiddenError } from '../../rpc/errors';

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const projectRouter = createTRPCRouter({
  getProjectWithClients: procedure
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
  activationStatus: procedure
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

  list: procedure
    .input(z.object({ organizationId: z.string().nullable() }))
    .query(async ({ input: { organizationId }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      if (organizationId === null) {
        return [];
      }
      return ctx.services.project.getProjects({ organizationId, userId });
    }),

  update: procedure.input(zProjectUpdate).mutation(async ({ input, ctx }) => {
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

  create: procedure
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

  delete: procedure
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

  cancelDeletion: procedure
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
