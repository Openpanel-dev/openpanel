// Ported from packages/trpc/src/routers/project.ts (M6-002).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's project functions (DELEGATE
// PATTERN) — this module has no queue/cron of its own, so there is no
// `ctx.services.project`, same as `user`/`conversation`.
//
// The project-access ladder itself IS shared: `./src/access.ts` binds core's
// shared/access.ts ladder to @openpanel/db's real lookups, the same way
// packages/trpc/src/access.ts does for V1. It is dynamically imported
// (`loadAccessChecks`), same as organization.rpc.ts, so a static import here
// does not pull @openpanel/db's prisma client into every core test file.

import { zOnboardingProject, zProjectUpdate } from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError, TRPCForbiddenError } from '../../rpc/errors';
import {
  cancelProjectDeletion,
  createProjectForOrganization,
  getProjectActivationStatus,
  getProjectById,
  getProjects,
  getProjectWithClients,
  scheduleProjectDeletion,
  updateProjectForOrganization,
} from './project.service';

function loadAccessChecks() {
  return import('./src/access');
}

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
      const { getProjectAccess } = await loadAccessChecks();
      const access = await getProjectAccess({ userId, projectId });
      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }
      return getProjectWithClients(projectId);
    }),

  // Powers the activation checklist on the project overview: has the project
  // received data, built a report, and invited a teammate yet?
  activationStatus: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { getProjectAccess } = await loadAccessChecks();
      const access = await getProjectAccess({ userId, projectId });
      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      return getProjectActivationStatus(projectId);
    }),

  list: procedure
    .input(z.object({ organizationId: z.string().nullable() }))
    .query(async ({ input: { organizationId }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      if (organizationId === null) {
        return [];
      }
      return getProjects({ organizationId, userId });
    }),

  update: procedure.input(zProjectUpdate).mutation(async ({ input, ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    const { requireProjectAccess } = await loadAccessChecks();
    await requireProjectAccess({ userId, projectId: input.id, level: 'write' });

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

  create: procedure
    .input(zOnboardingProject)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      if (!input.organizationId) {
        throw new TRPCForbiddenError('Organization is required');
      }

      const { getOrganizationAccess } = await loadAccessChecks();
      const access = await getOrganizationAccess({
        userId,
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

  delete: procedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { requireProjectAdmin } = await loadAccessChecks();
      // Destroying a project is admin-tier, matching project.create.
      await requireProjectAdmin({
        userId,
        projectId: input.projectId,
        message: 'Only organization admins can delete projects',
      });

      await scheduleProjectDeletion(input.projectId);
      return true;
    }),

  cancelDeletion: procedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { requireProjectAdmin } = await loadAccessChecks();
      await requireProjectAdmin({
        userId,
        projectId: input.projectId,
        message: 'Only organization admins can cancel a project deletion',
      });

      await cancelProjectDeletion(input.projectId);
      return true;
    }),
});
