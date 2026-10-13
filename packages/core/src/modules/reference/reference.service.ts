import type { Reference } from '@openpanel/db/src/prisma-client';
import type { ServiceDeps, Services } from '../../services';
import { getSettingsForProject } from '../organization/organization.service';
import type { IChartRange } from '../report/report.constants';
import { getChartStartEndDate } from '../report/src/chart-dates';

export type IServiceReference = Reference;

export interface ListReferencesInput {
  projectId: string;
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

export interface CreateReferenceForOrganizationInput {
  projectId: string;
  title: string;
  description?: string;
  datetime: string;
}

export interface UpdateReferenceForOrganizationInput {
  title?: string;
  description?: string;
  datetime?: string;
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

/** Throws Prisma's own not-found error. Used by both routers' ownership
 *  lookup ahead of their own access check. */
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

/** `null` when `projectId` is given but belongs to another organization. */
export async function listReferencesForOrganization(
  deps: ServiceDeps,
  organizationId: string,
  projectId?: string
): Promise<Reference[] | null> {
  if (projectId) {
    const project = await deps.db.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) {
      return null;
    }
  }
  return deps.db.reference.findMany({
    where: projectId ? { projectId } : { project: { organizationId } },
    orderBy: { createdAt: 'desc' },
  });
}

export function getReferenceForOrganization(
  deps: ServiceDeps,
  id: string,
  organizationId: string
): Promise<Reference | null> {
  return deps.db.reference.findFirst({
    where: { id, project: { organizationId } },
  });
}

/** `null` when the project belongs to another organization. */
export async function createReferenceForOrganization(
  deps: ServiceDeps,
  organizationId: string,
  input: CreateReferenceForOrganizationInput
): Promise<Reference | null> {
  const project = await deps.db.project.findFirst({
    where: { id: input.projectId, organizationId },
    select: { id: true },
  });
  if (!project) {
    return null;
  }
  return deps.db.reference.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      description: input.description || null,
      date: new Date(input.datetime),
    },
  });
}

export async function updateReferenceForOrganization(
  deps: ServiceDeps,
  id: string,
  organizationId: string,
  input: UpdateReferenceForOrganizationInput
): Promise<Reference | null> {
  const existing = await getReferenceForOrganization(deps, id, organizationId);
  if (!existing) {
    return null;
  }
  return deps.db.reference.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description,
      date: input.datetime === undefined ? undefined : new Date(input.datetime),
    },
  });
}

export async function deleteReferenceForOrganization(
  deps: ServiceDeps,
  id: string,
  organizationId: string
): Promise<boolean> {
  const existing = await getReferenceForOrganization(deps, id, organizationId);
  if (!existing) {
    return false;
  }
  await deps.db.reference.delete({ where: { id } });
  return true;
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
    listReferencesForOrganization: (
      organizationId: string,
      projectId?: string
    ): Promise<Reference[] | null> =>
      listReferencesForOrganization(deps, organizationId, projectId),
    getReferenceForOrganization: (
      id: string,
      organizationId: string
    ): Promise<Reference | null> =>
      getReferenceForOrganization(deps, id, organizationId),
    createReferenceForOrganization: (
      organizationId: string,
      input: CreateReferenceForOrganizationInput
    ): Promise<Reference | null> =>
      createReferenceForOrganization(deps, organizationId, input),
    updateReferenceForOrganization: (
      id: string,
      organizationId: string,
      input: UpdateReferenceForOrganizationInput
    ): Promise<Reference | null> =>
      updateReferenceForOrganization(deps, id, organizationId, input),
    deleteReferenceForOrganization: (
      id: string,
      organizationId: string
    ): Promise<boolean> =>
      deleteReferenceForOrganization(deps, id, organizationId),
  };
}
