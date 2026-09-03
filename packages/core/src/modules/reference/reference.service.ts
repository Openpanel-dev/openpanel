// Moved from packages/db/src/services/reference.service.ts, plus the
// query/mutation bodies packages/trpc/src/routers/reference.ts held inline
// (M6-004, DELEGATE PATTERN: V1's router and this package's own
// reference.rpc.ts share one implementation, same as
// conversation.service.ts since M5-006). packages/db keeps a re-export shim:
// nothing outside this module's own routers reached it directly, but the
// shape stays for any future @openpanel/db importer, same as
// packages/db/src/services/organization.service.ts since M6-001.
//
// db access is LAZY, not a static top-level import — see insight.service.ts's
// header for the full reasoning (jobs.registry.ts and services.ts pull this
// module into the eager barrel chain nearly every core test file reaches, and
// constructing @openpanel/db's clients at import time would spawn a
// pino-pretty transport worker thread per test file).

import type { Reference } from '@openpanel/db/src/prisma-client';
import type { IChartRange } from '@openpanel/validation';

export type IServiceReference = Reference;

const REFERENCES_PAGE_SIZE = 50;

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

function loadDateService() {
  return import('@openpanel/db/src/services/date.service');
}

function loadOrganizationService() {
  return import('@openpanel/db/src/services/organization.service');
}

export async function getReferenceById(id: string): Promise<Reference | null> {
  const db = await loadDb();
  return db.reference.findUnique({ where: { id } });
}

/** Throws Prisma's own not-found error, same as V1's inline
 *  `findUniqueOrThrow` call sites — used by both routers' ownership lookup
 *  ahead of their own access check. */
export async function getReferenceByIdOrThrow(id: string): Promise<Reference> {
  const db = await loadDb();
  return db.reference.findUniqueOrThrow({ where: { id } });
}

export async function listReferences(input: {
  projectId: string;
  cursor?: number;
}): Promise<Reference[]> {
  const db = await loadDb();
  return db.reference.findMany({
    where: { projectId: input.projectId },
    take: REFERENCES_PAGE_SIZE,
    skip: input.cursor ? input.cursor * REFERENCES_PAGE_SIZE : 0,
  });
}

export async function createReference(input: {
  title: string;
  description?: string | null;
  datetime: string;
  projectId: string;
}): Promise<Reference> {
  const db = await loadDb();
  return db.reference.create({
    data: {
      title: input.title,
      description: input.description,
      projectId: input.projectId,
      date: new Date(input.datetime),
    },
  });
}

export async function updateReference(input: {
  id: string;
  title: string;
  description?: string | null;
  datetime: string;
}): Promise<Reference> {
  const db = await loadDb();
  return db.reference.update({
    where: { id: input.id },
    data: {
      title: input.title,
      description: input.description ?? null,
      date: new Date(input.datetime),
    },
  });
}

export async function deleteReference(id: string): Promise<Reference> {
  const db = await loadDb();
  return db.reference.delete({ where: { id } });
}

export async function getChartReferences(input: {
  projectId: string;
  startDate?: string | null;
  endDate?: string | null;
  range: IChartRange;
}): Promise<Reference[]> {
  const { getSettingsForProject } = await loadOrganizationService();
  const { timezone } = await getSettingsForProject(input.projectId);

  const { getChartStartEndDate } = await loadDateService();
  const { startDate, endDate } = getChartStartEndDate(
    {
      startDate: input.startDate,
      endDate: input.endDate,
      range: input.range,
    },
    timezone
  );

  const db = await loadDb();
  return db.reference.findMany({
    where: {
      projectId: input.projectId,
      date: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    },
  });
}
