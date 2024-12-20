import { db } from '../prisma-client';

export async function getUserById(id: string) {
  return db.user.findUniqueOrThrow({
    where: {
      id,
    },
  });
}

export async function getUserAccount({
  email,
  provider,
  providerId,
}: { email: string; provider: string; providerId?: string }) {
  const res = await db.user.findFirst({
    where: {
      email,
    },
    include: {
      accounts: {
        where: {
          provider,
          providerId: providerId ? String(providerId) : undefined,
        },
        take: 1,
      },
    },
  });

  if (!res?.accounts[0]) {
    return null;
  }

  return {
    ...res,
    account: res?.accounts[0],
  };
}
