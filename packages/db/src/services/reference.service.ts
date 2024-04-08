import type { Prisma, Reference } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceReference = Reference;

export async function getReferenceById(id: string) {
  const reference = await db.reference.findUnique({
    where: {
      id,
    },
  });

  if (!reference) {
    return null;
  }

  return reference;
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
  return db.reference.findMany({
    where,
    take: take ?? 50,
    skip,
  });
}
