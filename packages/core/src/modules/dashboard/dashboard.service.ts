// Moved from packages/db/src/services/dashboard.service.ts, plus the
// create/update/delete mutation bodies packages/trpc/src/routers/dashboard.ts
// held inline (M7-006, ADR-008's module map: dashboard owns "R,S").
//
// M10-003: every function takes `ServiceDeps` and reaches Postgres as
// `deps.db`; the `loadDb()` / `loadIdService()` lazy loaders are gone, so
// this module value-imports neither `@openpanel/db` nor its own package
// barrel — the Prisma row types below are `import type`, erased at runtime
// (docs/TECH_DEBT.md §4).

import type { Dashboard, Prisma } from '@openpanel/db/src/prisma-client';
import { PrismaError } from 'prisma-error-enum';
import { TRPCNotFoundError } from '../../rpc/errors';
import type { ServiceDeps } from '../../services';
import { getId } from '../../shared/slug-id';
import { getProjectById } from '../project/project.service';

export type IServiceDashboard = Dashboard;
export type IServiceDashboards = Prisma.DashboardGetPayload<{
  include: {
    project: true;
    reports: true;
  };
}>[];

export type DashboardWithProject = Prisma.DashboardGetPayload<{
  include: { project: true };
}>;

export interface DashboardListItem {
  id: string;
  name: string;
  projectId: string;
}

export function getDashboardById(
  deps: ServiceDeps,
  id: string,
  projectId: string
): Promise<DashboardWithProject | null> {
  return deps.db.dashboard.findUnique({
    where: {
      id,
      projectId,
    },
    include: {
      project: true,
    },
  });
}

/** Unscoped lookup for mutation handlers that only receive a dashboard id and
 *  need its `projectId` to run the access check — same shape as V1's inline
 *  `db.dashboard.findUniqueOrThrow`. */
export function getDashboardByIdOrThrow(
  deps: ServiceDeps,
  id: string
): Promise<Dashboard> {
  return deps.db.dashboard.findUniqueOrThrow({ where: { id } });
}

export function getDashboardsByProjectId(
  deps: ServiceDeps,
  projectId: string
): Promise<IServiceDashboards> {
  return deps.db.dashboard.findMany({
    where: {
      projectId,
    },
    include: {
      project: true,
      reports: true,
    },
  });
}

export function listDashboardsCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    organizationId: string;
  }
): Promise<DashboardListItem[]> {
  return deps.db.dashboard.findMany({
    where: { projectId: input.projectId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, projectId: true },
  });
}

export async function createDashboard(
  deps: ServiceDeps,
  input: {
    name: string;
    projectId: string;
  }
): Promise<Dashboard> {
  const project = await getProjectById(deps, input.projectId);

  if (!project) {
    throw new TRPCNotFoundError('Project not found');
  }

  return deps.db.dashboard.create({
    data: {
      id: await getId('dashboard', input.name),
      projectId: input.projectId,
      organizationId: project.organizationId,
      name: input.name,
    },
  });
}

export function updateDashboard(
  deps: ServiceDeps,
  input: { id: string; name: string }
): Promise<Dashboard> {
  return deps.db.dashboard.update({
    where: {
      id: input.id,
    },
    data: {
      name: input.name,
    },
  });
}

export async function deleteDashboard(
  deps: ServiceDeps,
  input: {
    id: string;
    forceDelete?: boolean;
  }
): Promise<void> {
  try {
    if (input.forceDelete) {
      await deps.db.report.deleteMany({
        where: {
          dashboardId: input.id,
        },
      });
    }
    await deps.db.dashboard.delete({
      where: {
        id: input.id,
      },
    });
  } catch (e) {
    // Below does not work...
    // error instanceof Prisma.PrismaClientKnownRequestError
    if (typeof e === 'object' && e && 'code' in e) {
      const error = e as Prisma.PrismaClientKnownRequestError;
      switch (error.code) {
        case PrismaError.ForeignConstraintViolation:
          throw new Error('Cannot delete dashboard with associated reports');
        default:
          throw new Error('Unknown error deleting dashboard');
      }
    }
  }
}

export interface DashboardService {
  getDashboardById(
    id: string,
    projectId: string
  ): Promise<DashboardWithProject | null>;
  getDashboardByIdOrThrow(id: string): Promise<Dashboard>;
  getDashboardsByProjectId(projectId: string): Promise<IServiceDashboards>;
  listDashboardsCore(input: {
    projectId: string;
    organizationId: string;
  }): Promise<DashboardListItem[]>;
  createDashboard(input: {
    name: string;
    projectId: string;
  }): Promise<Dashboard>;
  updateDashboard(input: { id: string; name: string }): Promise<Dashboard>;
  deleteDashboard(input: { id: string; forceDelete?: boolean }): Promise<void>;
}

export function createDashboardService(deps: ServiceDeps): DashboardService {
  return {
    getDashboardById: (id, projectId) => getDashboardById(deps, id, projectId),
    getDashboardByIdOrThrow: (id) => getDashboardByIdOrThrow(deps, id),
    getDashboardsByProjectId: (projectId) =>
      getDashboardsByProjectId(deps, projectId),
    listDashboardsCore: (input) => listDashboardsCore(deps, input),
    createDashboard: (input) => createDashboard(deps, input),
    updateDashboard: (input) => updateDashboard(deps, input),
    deleteDashboard: (input) => deleteDashboard(deps, input),
  };
}
