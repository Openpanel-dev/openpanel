import type { Prisma, Reference } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceReference = Omit<Reference, 'project_id'> & {
  projectId: string;
};

export function transformReference({
  project_id,
  ...item
}: Reference): IServiceReference {
  return {
    ...item,
    projectId: project_id,
  };
}

export async function getReferenceById(id: string) {
  const reference = await db.reference.findUnique({
    where: {
      id,
    },
  });

  if (!reference) {
    return null;
  }

  return transformReference(reference);
}

export async function getReferences({
  where,
  take,
  skip,
}: {
  where: Prisma.ReferenceWhereInput;
  take?: number;
  skip?: number;
}) {
  const references = await db.reference.findMany({
    where,
    take: take ?? 50,
    skip,
  });

  return references.map(transformReference);
}
