import { tool } from 'ai';
import { z } from 'zod';
import { listDashboardsCore } from '../../../dashboard/dashboard.service';
import { listReportsCore } from '../../../report/report.service';
import type { ChatToolContext } from '../context';
import { buildReportConfig, zChartInput } from './charts';
import { dashboardUrl } from './shared';

export function dashboardTools(ctx: ChatToolContext) {
  const { deps, projectId, organizationId, actions } = ctx;

  return {
    list_dashboards: tool({
      description:
        'The saved dashboards in this project with their ids and links.',
      inputSchema: z.object({}),
      execute: async () => {
        const dashboards = await listDashboardsCore(deps, {
          projectId,
          organizationId,
        });
        return dashboards.map((dashboard) => ({
          id: dashboard.id,
          name: dashboard.name,
          url: dashboardUrl(ctx, `/dashboards/${dashboard.id}`),
        }));
      },
    }),

    list_reports: tool({
      description:
        'The reports on one dashboard: id, name, chart type, events and range. Use get_report to run one.',
      inputSchema: z.object({ dashboardId: z.string() }),
      execute: ({ dashboardId }) =>
        listReportsCore(deps, { projectId, dashboardId, organizationId }),
    }),

    create_dashboard: tool({
      description:
        'Create an empty dashboard. Asks the user to confirm. Follow up with save_chart to fill it.',
      inputSchema: z.object({ name: z.string().min(1) }),
      execute: async ({ name }) => {
        const dashboard = await actions.dashboard.create({ name, projectId });
        return {
          id: dashboard.id,
          name: dashboard.name,
          url: dashboardUrl(ctx, `/dashboards/${dashboard.id}`),
        };
      },
    }),

    save_chart: tool({
      description:
        'Save a chart as a report on a dashboard. Asks the user to confirm. Pass the same chart definition you used (or would use) with create_chart, plus the dashboard id from list_dashboards or create_dashboard.',
      inputSchema: z.object({
        dashboardId: z.string(),
        chart: zChartInput,
      }),
      execute: async ({ dashboardId, chart }) => {
        const built = buildReportConfig(ctx, chart);
        if ('error' in built) {
          return built;
        }
        const { projectId: _projectId, ...report } = built.config;
        const saved = await actions.report.create({ dashboardId, report });
        return {
          id: saved.id,
          name: saved.name,
          dashboardId,
          url: dashboardUrl(ctx, `/reports/${saved.id}`),
        };
      },
    }),

    create_reference: tool({
      description:
        'Add a reference: an annotation on a date that shows on every chart (launch, campaign, deploy, outage). Asks the user to confirm.',
      inputSchema: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        date: z.string().describe('ISO date or datetime.'),
      }),
      execute: async ({ title, description, date }) => {
        const reference = await actions.reference.create({
          projectId,
          title,
          description: description ?? null,
          datetime: new Date(date).toISOString(),
        });
        return {
          id: reference.id,
          title: reference.title,
          url: dashboardUrl(ctx, '/references'),
        };
      },
    }),

    invite_member: tool({
      description:
        'Invite a teammate to the workspace by email with access to all projects. Asks the user to confirm.',
      inputSchema: z.object({
        email: z.string().email(),
        role: z.enum(['admin', 'member']).default('member'),
      }),
      execute: async ({ email, role }) => {
        const invite = await actions.organization.inviteUser({
          email,
          organizationId,
          role,
          projectScope: 'all',
          access: [],
        });
        return {
          ...invite,
          url: dashboardUrl(ctx, '/settings').replace(`/${projectId}`, ''),
        };
      },
    }),

    update_project: tool({
      description:
        'Rename the project or change its domain. Asks the user to confirm. Other settings live on the settings page; use navigate for those.',
      inputSchema: z.object({
        name: z.string().min(1).optional(),
        domain: z.string().url().optional(),
      }),
      execute: async ({ name, domain }) => {
        const project = await actions.project.update({
          id: projectId,
          name,
          domain,
        });
        if (!project) {
          return { error: 'Project not found' };
        }
        return { id: project.id, name: project.name, domain: project.domain };
      },
    }),
  };
}
