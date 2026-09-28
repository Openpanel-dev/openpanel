// The /manage/projects REST surface. V1's Fastify controller
// (apps/api/src/controllers/manage.controller.ts) stays the LIVE route
// (DELEGATE PATTERN) and delegates its CRUD bodies to project.service.ts's
// createProjectForOrganization/updateProjectForOrganization/etc — the same
// functions this route calls. Response envelopes (`{ data }` / `{ success }`)
// match V1's `reply.send(...)` shape exactly (byte-unchanged URL surface).
//
// NAMED GAP, same as import.routes.ts: this route is not yet reachable.
// `authenticateClient` (http/client-auth.ts) is a P8 stub that always returns
// null, so `clientAuth` 401s every request until it is filled in; main.ts also
// does not mount `publicApiRoutes` until a real `AppDeps` exists. `allow:
// ['root']` mirrors V1's rule (utils/auth.ts's `validateManageRequest`: only
// root clients may manage resources).

import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import { zCreateProject, zUpdateProject } from './project.constants';

const idParams = z.object({ id: z.string() });

export const projectRoutes = defineRoutes((app) =>
  app
    .get(
      '/manage/projects',
      async ({ client, ctx }) => ({
        data: await ctx.services.project.listProjectsForOrganization(
          client.organizationId
        ),
      }),
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        detail: { tags: ['Manage'] },
      }
    )
    .get(
      '/manage/projects/:id',
      async ({ client, ctx, params, status }) => {
        const project = await ctx.services.project.getProjectForOrganization(
          params.id,
          client.organizationId
        );
        if (!project) {
          return status(404, {
            error: 'Not Found',
            message: 'Project not found',
          });
        }
        return { data: project };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: idParams,
        detail: { tags: ['Manage'] },
      }
    )
    .post(
      '/manage/projects',
      async ({ body, client, ctx }) => {
        const { project, client: firstClient } =
          await ctx.services.project.createProjectForOrganization(
            client.organizationId,
            {
              name: body.name,
              domain: body.domain,
              cors: body.cors,
              crossDomain: body.crossDomain,
              types: body.types,
            }
          );
        return { data: { ...project, client: firstClient } };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        body: zCreateProject,
        detail: { tags: ['Manage'] },
      }
    )
    .patch(
      '/manage/projects/:id',
      async ({ body, client, ctx, params, status }) => {
        const project = await ctx.services.project.updateProjectForOrganization(
          params.id,
          client.organizationId,
          body
        );
        if (!project) {
          return status(404, {
            error: 'Not Found',
            message: 'Project not found',
          });
        }
        return { data: project };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: idParams,
        body: zUpdateProject,
        detail: { tags: ['Manage'] },
      }
    )
    .delete(
      '/manage/projects/:id',
      async ({ client, ctx, params, status }) => {
        const deleted = await ctx.services.project.deleteProjectForOrganization(
          params.id,
          client.organizationId
        );
        if (!deleted) {
          return status(404, {
            error: 'Not Found',
            message: 'Project not found',
          });
        }
        return { success: true };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: idParams,
        detail: { tags: ['Manage'] },
      }
    )
);
