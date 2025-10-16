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
