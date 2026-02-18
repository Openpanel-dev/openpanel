import { db } from '../prisma-client';

export type IServiceGroup = {
  id: string;
  projectId: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type IServiceUpsertGroup = {
  id: string;
  projectId: string;
  type: string;
  name: string;
  properties?: Record<string, unknown>;
};

export async function upsertGroup(input: IServiceUpsertGroup) {
  const { id, projectId, type, name, properties = {} } = input;

  await db.group.upsert({
    where: {
      projectId_id: { projectId, id },
    },
    update: {
      type,
      name,
      properties: properties as Record<string, string>,
      updatedAt: new Date(),
    },
    create: {
      id,
      projectId,
      type,
      name,
      properties: properties as Record<string, string>,
    },
  });
}

export async function getGroupById(
  id: string,
  projectId: string
): Promise<IServiceGroup | null> {
  const group = await db.group.findUnique({
    where: { projectId_id: { projectId, id } },
  });

  if (!group) {
    return null;
  }

  return {
    id: group.id,
    projectId: group.projectId,
    type: group.type,
    name: group.name,
    properties: (group.properties as Record<string, unknown>) ?? {},
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

export async function getGroupList({
  projectId,
  cursor,
  take,
  search,
  type,
}: {
  projectId: string;
  cursor?: number;
  take: number;
  search?: string;
  type?: string;
}): Promise<IServiceGroup[]> {
  const groups = await db.group.findMany({
    where: {
      projectId,
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { id: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    skip: cursor,
  });

  return groups.map((group) => ({
    id: group.id,
    projectId: group.projectId,
    type: group.type,
    name: group.name,
    properties: (group.properties as Record<string, unknown>) ?? {},
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  }));
}

export async function getGroupListCount({
  projectId,
  type,
  search,
}: {
  projectId: string;
  type?: string;
  search?: string;
}): Promise<number> {
  return db.group.count({
    where: {
      projectId,
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { id: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
  });
}

export async function getGroupTypes(projectId: string): Promise<string[]> {
  const groups = await db.group.findMany({
    where: { projectId },
    select: { type: true },
    distinct: ['type'],
  });
  return groups.map((g) => g.type);
}

export async function deleteGroup(id: string, projectId: string) {
  return db.group.delete({
    where: { projectId_id: { projectId, id } },
  });
}
