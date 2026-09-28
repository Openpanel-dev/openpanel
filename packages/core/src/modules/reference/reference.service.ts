// Every function takes `ServiceDeps` and reaches Postgres as `deps.db`. The
// `loadDb` / `loadDateService` / `loadOrganizationService` lazy loaders are
// gone: nothing here value-imports `@openpanel/db` or this package's own barrel
// any more (the Prisma row type below is `import type`, erased at runtime), so
// there is no import-time client — and no pino-pretty worker per test file —
// left to defer.

import type { Reference } from '@openpanel/db/src/prisma-client';
import type { ServiceDeps, Services } from '../../services';
import { getSettingsForProject } from '../organization/organization.service';
import type { IChartRange } from '../report/report.constants';
import { getChartStartEndDate } from '../report/src/chart-dates';

export type IServiceReference = Reference;

const REFERENCES_PAGE_SIZE = 50;

export interface ListReferencesInput {
  projectId: string;
  cursor?: number;
}

export interface CreateReferenceInput {
  title: string;
  description?: string | null;
  datetime: string;
  projectId: string;
}

export interface UpdateReferenceInput {
  id: string;
  title: string;
  description?: string | null;
  datetime: string;
}

export interface ChartReferencesInput {
  projectId: string;
  startDate?: string | null;
  endDate?: string | null;
  range: IChartRange;
}

export function getReferenceById(
  deps: ServiceDeps,
  id: string
): Promise<Reference | null> {
  return deps.db.reference.findUnique({ where: { id } });
}

/** Throws Prisma's own not-found error, same as V1's inline
 *  `findUniqueOrThrow` call sites — used by both routers' ownership lookup
 *  ahead of their own access check. */
export function getReferenceByIdOrThrow(
  deps: ServiceDeps,
  id: string
): Promise<Reference> {
  return deps.db.reference.findUniqueOrThrow({ where: { id } });
}

export function listReferences(
  deps: ServiceDeps,
  input: ListReferencesInput
): Promise<Reference[]> {
  return deps.db.reference.findMany({
    where: { projectId: input.projectId },
    take: REFERENCES_PAGE_SIZE,
    skip: input.cursor ? input.cursor * REFERENCES_PAGE_SIZE : 0,
  });
}

export function createReference(
  deps: ServiceDeps,
  input: CreateReferenceInput
): Promise<Reference> {
  return deps.db.reference.create({
    data: {
      title: input.title,
      description: input.description,
      projectId: input.projectId,
      date: new Date(input.datetime),
    },
  });
}

export function updateReference(
  deps: ServiceDeps,
  input: UpdateReferenceInput
): Promise<Reference> {
  return deps.db.reference.update({
    where: { id: input.id },
    data: {
      title: input.title,
      description: input.description ?? null,
      date: new Date(input.datetime),
    },
  });
}

export function deleteReference(
  deps: ServiceDeps,
  id: string
): Promise<Reference> {
  return deps.db.reference.delete({ where: { id } });
}

export async function getChartReferences(
  deps: ServiceDeps,
  input: ChartReferencesInput
): Promise<Reference[]> {
  const { timezone } = await getSettingsForProject(deps, input.projectId);
  const { startDate, endDate } = getChartStartEndDate(
    {
      startDate: input.startDate,
      endDate: input.endDate,
      range: input.range,
    },
    timezone
  );

  return deps.db.reference.findMany({
    where: {
      projectId: input.projectId,
      date: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    },
  });
}

export function createReferenceService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    getReferenceById: (id: string): Promise<Reference | null> =>
      getReferenceById(deps, id),
    getReferenceByIdOrThrow: (id: string): Promise<Reference> =>
      getReferenceByIdOrThrow(deps, id),
    listReferences: (input: ListReferencesInput): Promise<Reference[]> =>
      listReferences(deps, input),
    createReference: (input: CreateReferenceInput): Promise<Reference> =>
      createReference(deps, input),
    updateReference: (input: UpdateReferenceInput): Promise<Reference> =>
      updateReference(deps, input),
    deleteReference: (id: string): Promise<Reference> =>
      deleteReference(deps, id),
    getChartReferences: (input: ChartReferencesInput): Promise<Reference[]> =>
      getChartReferences(deps, input),
  };
}
