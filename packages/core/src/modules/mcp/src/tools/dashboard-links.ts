import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CoreConfig } from '../../../../config';
import {
  type McpToolDeps,
  projectIdSchema,
  resolveProjectId,
  withErrorHandling,
} from './shared';

const DEFAULT_DASHBOARD_URL = 'https://dashboard.openpanel.dev';
const TRAILING_SLASH = /\/$/;

export function dashboardBaseUrl(config: CoreConfig) {
  return (config.dashboardUrl || DEFAULT_DASHBOARD_URL).replace(
    TRAILING_SLASH,
    ''
  );
}

export function profileUrl(
  config: CoreConfig,
  organizationId: string,
  projectId: string,
  profileId: string
) {
  return `${dashboardBaseUrl(config)}/${organizationId}/${projectId}/profiles/${profileId}`;
}

export function sessionUrl(
  config: CoreConfig,
  organizationId: string,
  projectId: string,
  sessionId: string
) {
  return `${dashboardBaseUrl(config)}/${organizationId}/${projectId}/sessions/${sessionId}`;
}

export function registerDashboardLinkTools(
  server: McpServer,
  { context, deps }: McpToolDeps
) {
  server.tool(
    'get_dashboard_urls',
    'Get clickable dashboard URLs for the current project. Returns links to all main sections (overview, events, profiles, sessions, etc.) and optionally deep-links to a specific profile, session, dashboard, or report when their IDs are provided. Use these links to let the user navigate directly to relevant pages.',
    {
      projectId: projectIdSchema(context),
      profileId: z
        .string()
        .optional()
        .describe('Profile ID to get a direct link to that profile'),
      sessionId: z
        .string()
        .optional()
        .describe('Session ID to get a direct link to that session'),
      dashboardId: z
        .string()
        .optional()
        .describe('Dashboard ID to get a direct link to that dashboard'),
      reportId: z
        .string()
        .optional()
        .describe('Report ID to get a direct link to that report'),
    },
    async ({
      projectId: inputProjectId,
      profileId,
      sessionId,
      dashboardId,
      reportId,
    }) =>
      withErrorHandling(deps, async () => {
        const projectId = await resolveProjectId(deps, context, inputProjectId);
        // Every segment below is caller data — a project or profile id can
        // contain `/`, `?` or `#` and would otherwise change what the URL
        // points at.
        const segment = encodeURIComponent;
        const base = `${dashboardBaseUrl(deps.config)}/${segment(context.organizationId)}/${segment(projectId)}`;

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
          urls.profile = `${base}/profiles/${segment(profileId)}`;
        }
        if (sessionId) {
          urls.session = `${base}/sessions/${segment(sessionId)}`;
        }
        if (dashboardId) {
          urls.dashboard = `${base}/dashboards/${segment(dashboardId)}`;
        }
        if (reportId) {
          urls.report = `${base}/reports/${segment(reportId)}`;
        }

        return urls;
      })
  );
}
