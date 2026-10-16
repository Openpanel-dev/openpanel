// Sibling services are imported by relative path, not through the package barrel,
// to avoid re-entering it mid-evaluation.

import { resolveDateRange } from '@openpanel/shared';
import type { AuthenticatedClient } from '../../http/client-auth';
import type { ServiceDeps, Services } from '../../services';
import { getSettingsForProject } from '../organization/organization.service';
import { resolveClientProjectId } from '../project/project.service';
import type { IChartRange } from '../report/report.constants';
import { getChartStartEndDate } from '../report/src/chart-dates';

export type ProjectIdResolution =
  | { ok: true; projectId: string }
  | { ok: false; status: 400 | 403 | 404; message: string };

/**
 * `/export/*`'s own project-id resolution: the project id travels in the
 * QUERYSTRING (`project_id`/`projectId`), not a path param, and a `read`
 * client may pass one as long as it matches their own — a different shape
 * than `/insights`'s path-param resolution below, so it stays its own
 * function rather than being folded into `resolveClientProjectId`.
 */
export async function resolveExportProjectId(
  deps: ServiceDeps,
  client: AuthenticatedClient,
  query: { project_id?: string; projectId?: string }
): Promise<ProjectIdResolution> {
  let projectId = query.projectId || query.project_id;

  if (projectId) {
    if (client.type === 'read' && client.projectId !== projectId) {
      return {
        ok: false,
        status: 403,
        message: 'You do not have access to this project',
      };
    }

    const project = await deps.db.project.findUnique({
      where: { organizationId: client.organizationId, id: projectId },
    });

    if (!project) {
      return { ok: false, status: 404, message: 'Project not found' };
    }
  } else if (client.projectId) {
    projectId = client.projectId;
  }

  if (!projectId) {
    return {
      ok: false,
      status: 400,
      message: 'project_id or projectId is required',
    };
  }

  return { ok: true, projectId };
}

/**
 * `/insights/:projectId/*`'s project-id resolution — `resolveClientProjectId`
 * is the single client->project resolution point.
 */
export async function resolveInsightsProjectId(
  deps: ServiceDeps,
  client: AuthenticatedClient,
  params: { projectId?: string }
): Promise<string> {
  return resolveClientProjectId(deps, {
    clientType: client.type === 'root' ? 'root' : 'read',
    clientProjectId: client.projectId,
    organizationId: client.organizationId,
    inputProjectId: params.projectId,
  });
}

/**
 * A `range` needs the project's timezone to resolve; an explicit `startDate`
 * does not.
 */
export async function resolveInsightsDateRange(
  deps: ServiceDeps,
  projectId: string,
  data: { startDate?: string; endDate?: string; range?: IChartRange }
): Promise<{ startDate: string; endDate: string }> {
  if (!data.range || data.startDate) {
    return resolveDateRange(data.startDate, data.endDate);
  }
  const { timezone } = await getSettingsForProject(deps, projectId);
  return getChartStartEndDate(
    { startDate: data.startDate, endDate: data.endDate, range: data.range },
    timezone
  );
}

/** `YYYY-MM-DD`. */
const DATE_ONLY_LENGTH = 10;

/**
 * The GSC tables store `date` as a ClickHouse `Date` and Google's
 * searchAnalytics API takes `YYYY-MM-DD`, so the datetime bounds the event and
 * session tables need are wrong for both: ClickHouse refuses
 * `'2026-08-07 00:00:00'` with "Cannot convert string ... to type Date", which
 * failed every /insights/:projectId/gsc/* route for a named `range`.
 */
export async function resolveGscInsightsDateRange(
  deps: ServiceDeps,
  projectId: string,
  data: { startDate?: string; endDate?: string; range?: IChartRange }
): Promise<{ startDate: string; endDate: string }> {
  const { startDate, endDate } = await resolveInsightsDateRange(
    deps,
    projectId,
    data
  );
  return {
    startDate: startDate.slice(0, DATE_ONLY_LENGTH),
    endDate: endDate.slice(0, DATE_ONLY_LENGTH),
  };
}

export function createExportService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    resolveExportProjectId: (
      client: AuthenticatedClient,
      query: { project_id?: string; projectId?: string }
    ): Promise<ProjectIdResolution> =>
      resolveExportProjectId(deps, client, query),
    resolveInsightsProjectId,
    resolveInsightsDateRange: (
      projectId: string,
      data: { startDate?: string; endDate?: string; range?: IChartRange }
    ): Promise<{ startDate: string; endDate: string }> =>
      resolveInsightsDateRange(deps, projectId, data),
  };
}
