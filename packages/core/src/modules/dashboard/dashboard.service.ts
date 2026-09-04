// Moved from packages/db/src/services/dashboard.service.ts, plus the
// create/update/delete mutation bodies packages/trpc/src/routers/dashboard.ts
// held inline (M7-006, ADR-008's module map: dashboard owns "R,S").
// packages/db/src/services/dashboard.service.ts stays a re-export shim
// (DELEGATE PATTERN), same shape as project.service.ts since M6-002.
//
// db access is LAZY, not a static top-level import — dashboard.rpc.ts lands
// in the eager rpc.router.ts barrel chain nearly every core test file
// reaches, and constructing @openpanel/db's clients at import time would
// spawn a pino-pretty transport worker thread per test file (see
// insight.service.ts's header / project.service.ts's header).

import type { Dashboard, Prisma } from '@openpanel/db/src/prisma-client';
import { PrismaError } from 'prisma-error-enum';
import { TRPCNotFoundError } from '../../rpc/errors';
import { getProjectById } from '../project/project.service';

export type IServiceDashboard = Dashboard;
export type IServiceDashboards = Prisma.DashboardGetPayload<{
  include: {
    project: true;
    reports: true;
  };
}>[];

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

function loadIdService() {
  return import('@openpanel/db/src/services/id.service').then((m) => m.getId);
}

export async function getDashboardById(id: string, projectId: string) {
  const db = await loadDb();
  const dashboard = await db.dashboard.findUnique({
    where: {
      id,
      projectId,
    },
    include: {
      project: true,
    },
  });

  if (!dashboard) {
    return null;
  }

  return dashboard;
}

/** Unscoped lookup for mutation handlers that only receive a dashboard id and
 *  need its `projectId` to run the access check — same shape as V1's inline
 *  `db.dashboard.findUniqueOrThrow`. */
export async function getDashboardByIdOrThrow(id: string) {
  const db = await loadDb();
  return db.dashboard.findUniqueOrThrow({ where: { id } });
}

export function getDashboardsByProjectId(projectId: string) {
  return loadDb().then((db) =>
    db.dashboard.findMany({
      where: {
        projectId,
      },
      include: {
        project: true,
        reports: true,
      },
    })
  );
}

export async function listDashboardsCore(input: {
  projectId: string;
  organizationId: string;
}) {
  const db = await loadDb();
  return db.dashboard.findMany({
    where: { projectId: input.projectId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, projectId: true },
  });
}

export async function createDashboard(input: {
  name: string;
  projectId: string;
}) {
  const db = await loadDb();
  const project = await getProjectById(input.projectId);

  if (!project) {
    throw new TRPCNotFoundError('Project not found');
  }

  const getId = await loadIdService();

  return db.dashboard.create({
    data: {
      id: await getId('dashboard', input.name),
      projectId: input.projectId,
      organizationId: project.organizationId,
      name: input.name,
    },
  });
}

export async function updateDashboard(input: { id: string; name: string }) {
  const db = await loadDb();
  return db.dashboard.update({
    where: {
      id: input.id,
    },
    data: {
      name: input.name,
    },
  });
}

export async function deleteDashboard(input: {
  id: string;
  forceDelete?: boolean;
}) {
  const db = await loadDb();
  try {
    if (input.forceDelete) {
      await db.report.deleteMany({
        where: {
          dashboardId: input.id,
        },
      });
    }
    await db.dashboard.delete({
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
