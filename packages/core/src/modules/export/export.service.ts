// The export module owns no data of its own — it is the public read API
// (`/export` + `/insights`, ~35 GET routes, TARGET_ARCHITECTURE §7). Every
// handler in `export.routes.ts` is a thin delegate onto the overview/chart/
// event/session/profile/group/gsc/report services already ported to core
// (M7-001..006). This file holds only the plumbing every route shares —
// resolving a project id and a date range — ported verbatim from
// apps/api/src/controllers/{export,insights}.controller.ts. No new query
// logic: every resolution here already existed in V1's controllers.
//
// `@openpanel/db` is reached through `loadDb()`, not a static import:
// `export.routes.ts` mounts into `rest.routes.ts`, which `index.ts` — this
// package's curated barrel — imports. A static import here would make
// importing `@openpanel/core` from ANYWHERE eagerly evaluate the whole of
// `@openpanel/db` (every service, `packages/queue`'s still-V1 `getRedisQueue`
// included), which is exactly the "core ↔ db is an import cycle" hazard
// session.service.ts and event.service.ts already document — just reached via
// a different, much more central, file this time. A route body only pays for
// `@openpanel/db` when it actually runs, same reason `event.rpc.ts`'s
// `loadPagesRuntime()` exists.

import type { IChartRange } from '@openpanel/validation';
import type { AuthenticatedClient } from '../../http/client-auth';

export function loadDb() {
  return import('@openpanel/db');
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

    const { db } = await loadDb();
    const project = await db.project.findUnique({
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
  const { resolveClientProjectId } = await loadDb();
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
  projectId: string,
  data: { startDate?: string; endDate?: string; range?: IChartRange }
): Promise<{ startDate: string; endDate: string }> {
  const { getChartStartEndDate, getSettingsForProject, resolveDateRange } =
    await loadDb();
  if (!data.range || data.startDate) {
    return resolveDateRange(data.startDate, data.endDate);
  }
  const { timezone } = await getSettingsForProject(projectId);
  return getChartStartEndDate(
    { startDate: data.startDate, endDate: data.endDate, range: data.range },
    timezone
  );
}
