import { z } from 'zod';
import { defineRoutes } from '../../http/define';

const MANAGE_TAGS = ['Manage'];
const FORBIDDEN_PROJECT = {
  error: 'Forbidden',
  message: 'Project does not belong to your organization',
};

export const manageDashboardRoutes = defineRoutes((app) =>
  app
    .get(
      '/manage/projects/:id/dashboards',
      async ({ client, ctx, params, status }) => {
        const project = await ctx.services.project.getProjectForOrganization(
          params.id,
          client.organizationId
        );
        if (!project) {
          return status(403, FORBIDDEN_PROJECT);
        }
        return ctx.services.dashboard.listDashboardsCore({
          projectId: project.id,
          organizationId: client.organizationId,
        });
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: z.object({ id: z.string() }),
        detail: {
          tags: MANAGE_TAGS,
          description: 'List all dashboards for a project.',
        },
      }
    )
    .get(
      '/manage/projects/:id/dashboards/:dashboardId/reports',
      async ({ client, ctx, params, status }) => {
        const project = await ctx.services.project.getProjectForOrganization(
          params.id,
          client.organizationId
        );
        if (!project) {
          return status(403, FORBIDDEN_PROJECT);
        }
        return ctx.services.report.listReportsCore({
          projectId: project.id,
          dashboardId: params.dashboardId,
          organizationId: client.organizationId,
        });
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: z.object({ id: z.string(), dashboardId: z.string() }),
        detail: {
          tags: MANAGE_TAGS,
          description: 'List all reports in a dashboard.',
        },
      }
    )
);
