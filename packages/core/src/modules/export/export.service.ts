// The export module owns no data of its own — it is the public read API
// (`/export` + `/insights`, ~35 GET routes, TARGET_ARCHITECTURE §7). Every
// handler in `export.routes.ts` is a thin delegate onto the overview/chart/
// event/session/profile/group/gsc/report services already ported to core
// (M7-001..006). This file holds only the plumbing every route shares —
// resolving a project id and a date range — ported verbatim from
// apps/api/src/controllers/{export,insights}.controller.ts. No new query
// logic: every resolution here already existed in V1's controllers.
//
// M10-003: `loadDb()` and `loadCore()` are gone. Postgres is `deps.db`, and
// the sibling services these routes delegate to are imported by RELATIVE
// path — the hazard the old `loadCore()` guarded against was re-entering
// this package's own barrel (`@openpanel/core`) mid-evaluation, which a
// relative import cannot do (docs/TECH_DEBT.md §4).

import type { IChartRange } from '@openpanel/validation';
import type { AuthenticatedClient } from '../../http/client-auth';
import type { ServiceDeps } from '../../services';
import { getChartStartEndDate, resolveDateRange } from '../../shared/date';
import { getSettingsForProject } from '../organization/organization.service';

// project.service.ts's `resolveClientProjectId` takes `ServiceDeps` now
// (M10-004); `resolveInsightsProjectId` below is called from ~35 route
// handlers in export.routes.ts with no `deps` in their own signature, so it
// reaches the bare, v1-compat-wrapped spelling instead of threading `deps`
// through every one of them. GENUINE CYCLE, kept lazy: services.ts ->
// export.service.ts (this file) -> v1-compat.ts -> services.ts.
function loadProjectService() {
  return import('../../v1-compat');
}

export type ProjectIdResolution =
  | { ok: true; projectId: string }
  | { ok: false; status: 400 | 403 | 404; message: string };

/**
 * `/export/*`'s own project-id resolution (apps/api's export.controller.ts
 * `getProjectId`): the project id travels in the QUERYSTRING
 * (`project_id`/`projectId`), not a path param, and a `read` client may pass
 * one as long as it matches their own — a different shape than `/insights`'s
 * path-param resolution below, so it stays its own function rather than
 * being folded into `resolveClientProjectId`.
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
 * is the single client->project resolution point (ADR-011 A-iii invariant
 * 12), already what apps/api's insights.controller.ts `getProjectId` calls.
 */
export async function resolveInsightsProjectId(
  client: AuthenticatedClient,
  params: { projectId?: string }
): Promise<string> {
  const { resolveClientProjectId } = await loadProjectService();
  return resolveClientProjectId({
    clientType: client.type === 'root' ? 'root' : 'read',
    clientProjectId: client.projectId,
    organizationId: client.organizationId,
    inputProjectId: params.projectId,
  });
}

/**
 * Ported verbatim from insights.controller.ts's `resolveDates`: a `range`
 * needs the project's timezone to resolve; an explicit `startDate` does not.
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

// --- service ------------------------------------------------------------

export interface ExportService {
  resolveExportProjectId(
    client: AuthenticatedClient,
    query: { project_id?: string; projectId?: string }
  ): Promise<ProjectIdResolution>;
  resolveInsightsProjectId(
    client: AuthenticatedClient,
    params: { projectId?: string }
  ): Promise<string>;
  resolveInsightsDateRange(
    projectId: string,
    data: { startDate?: string; endDate?: string; range?: IChartRange }
  ): Promise<{ startDate: string; endDate: string }>;
}

export function createExportService(deps: ServiceDeps): ExportService {
  return {
    resolveExportProjectId: (client, query) =>
      resolveExportProjectId(deps, client, query),
    resolveInsightsProjectId,
    resolveInsightsDateRange: (projectId, data) =>
      resolveInsightsDateRange(deps, projectId, data),
  };
}
