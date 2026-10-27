import type {
  Dashboard,
  Prisma,
  ReportLayout,
} from '@openpanel/db/src/prisma-client';
import { PrismaError } from 'prisma-error-enum';
import { TRPCNotFoundError } from '../../rpc/errors';
import type { ServiceDeps, Services } from '../../services';
import { getId } from '../../slug-id';
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

type ReportWithLayout = Prisma.ReportGetPayload<{
  include: { layout: true };
}>;

const DUPLICATE_NAME_PREFIX = 'Copy of ';

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
 *  need its `projectId` to run the access check. */
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
      id: await getId(deps, 'dashboard', input.name),
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

function copyLayout({
  id: _id,
  reportId: _reportId,
  createdAt: _createdAt,
  updatedAt: _updatedAt,
  ...position
}: ReportLayout): Prisma.ReportLayoutCreateWithoutReportInput {
  return position;
}

// Spreads every column so a field added to `Report` later is copied too.
function copyReport(
  deps: ServiceDeps,
  {
    id: _id,
    dashboardId: _dashboardId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    layout,
    ...report
  }: ReportWithLayout
): Prisma.ReportUncheckedCreateWithoutDashboardInput {
  return {
    ...report,
    events: report.events ?? [],
    breakdowns: report.breakdowns ?? [],
    globalFilters: report.globalFilters ?? [],
    options: report.options ?? deps.prisma.DbNull,
    display: report.display ?? deps.prisma.DbNull,
    layout: layout ? { create: copyLayout(layout) } : undefined,
  };
}

/** Copies the dashboard with its reports and tile layout; share links stay with the original. */
export async function duplicateDashboard(
  deps: ServiceDeps,
  id: string
): Promise<Dashboard> {
  const source = await deps.db.dashboard.findUniqueOrThrow({
    where: { id },
    include: { reports: { include: { layout: true } } },
  });
  const name = `${DUPLICATE_NAME_PREFIX}${source.name}`;

  return deps.db.dashboard.create({
    data: {
      id: await getId(deps, 'dashboard', name),
      name,
      projectId: source.projectId,
      organizationId: source.organizationId,
      reports: {
        create: source.reports.map((report) => copyReport(deps, report)),
      },
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

export function createDashboardService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    getDashboardById: (
      id: string,
      projectId: string
    ): Promise<DashboardWithProject | null> =>
      getDashboardById(deps, id, projectId),
    getDashboardByIdOrThrow: (id: string): Promise<Dashboard> =>
      getDashboardByIdOrThrow(deps, id),
    getDashboardsByProjectId: (
      projectId: string
    ): Promise<IServiceDashboards> => getDashboardsByProjectId(deps, projectId),
    listDashboardsCore: (input: {
      projectId: string;
      organizationId: string;
    }): Promise<DashboardListItem[]> => listDashboardsCore(deps, input),
    createDashboard: (input: {
      name: string;
      projectId: string;
    }): Promise<Dashboard> => createDashboard(deps, input),
    updateDashboard: (input: {
      id: string;
      name: string;
    }): Promise<Dashboard> => updateDashboard(deps, input),
    duplicateDashboard: (id: string): Promise<Dashboard> =>
      duplicateDashboard(deps, id),
    deleteDashboard: (input: {
      id: string;
      forceDelete?: boolean;
    }): Promise<void> => deleteDashboard(deps, input),
  };
}
