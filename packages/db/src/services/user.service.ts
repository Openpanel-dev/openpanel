import { auth } from '@clerk/nextjs/server';

import { db } from '../prisma-client';

export async function getCurrentUser() {
  const session = auth();
  if (!session.userId) {
    return null;
  }
  return getUserById(session.userId);
}

export async function getUserById(id: string) {
  return db.user.findUnique({
    where: {
      id,
    },
  });
}
