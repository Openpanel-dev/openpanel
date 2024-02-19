import { db } from '../prisma-client';

export async function getCurrentSalt() {
  const salt = await db.salt.findFirst({
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!salt) {
    throw new Error('No salt found');
  }

  return salt.salt;
}

export async function getSalts() {
  const [curr, prev] = await db.salt.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    take: 2,
  });

  if (!curr) {
    throw new Error('No salt found');
  }

  if (!prev) {
    throw new Error('No previous salt found');
  }

  return {
    current: curr.salt,
    previous: prev.salt,
  };
}
