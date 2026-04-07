import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../auth';
import { projectIdSchema, resolveProjectId, withErrorHandling } from './shared';

export function dashboardBaseUrl() {
  return (
    process.env.DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_DASHBOARD_URL ||
    'https://dashboard.openpanel.dev'
  ).replace(/\/$/, '');
}

export function profileUrl(organizationId: string, projectId: string, profileId: string) {
  return `${dashboardBaseUrl()}/${organizationId}/${projectId}/profiles/${profileId}`;
}

export function sessionUrl(organizationId: string, projectId: string, sessionId: string) {
  return `${dashboardBaseUrl()}/${organizationId}/${projectId}/sessions/${sessionId}`;
}

export function registerDashboardLinkTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_dashboard_urls',
    'Get clickable dashboard URLs for the current project. Returns links to all main sections (overview, events, profiles, sessions, etc.) and optionally deep-links to a specific profile, session, dashboard, or report when their IDs are provided. Use these links to let the user navigate directly to relevant pages.',
    {
      projectId: projectIdSchema(context),
      profileId: z.string().optional().describe('Profile ID to get a direct link to that profile'),
      sessionId: z.string().optional().describe('Session ID to get a direct link to that session'),
      dashboardId: z.string().optional().describe('Dashboard ID to get a direct link to that dashboard'),
      reportId: z.string().optional().describe('Report ID to get a direct link to that report'),
    },
    async ({ projectId: inputProjectId, profileId, sessionId, dashboardId, reportId }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const base = `${dashboardBaseUrl()}/${context.organizationId}/${projectId}`;

        const urls: Record<string, string> = {
          overview: base,
          events: `${base}/events`,
          profiles: `${base}/profiles`,
          sessions: `${base}/sessions`,
          dashboards: `${base}/dashboards`,
          reports: `${base}/reports`,
          realtime: `${base}/realtime`,
          pages: `${base}/pages`,
          insights: `${base}/insights`,
        };

        if (profileId) {
          urls.profile = `${base}/profiles/${profileId}`;
        }
        if (sessionId) {
          urls.session = `${base}/sessions/${sessionId}`;
        }
        if (dashboardId) {
          urls.dashboard = `${base}/dashboards/${dashboardId}`;
        }
        if (reportId) {
          urls.report = `${base}/reports/${reportId}`;
        }

        return urls;
      }),
  );
}
