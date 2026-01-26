import { generateSalt } from '@openpanel/common/server';
import { db, getSalts } from '@openpanel/db';

async function generateNewSalt() {
  const newSalt = await db.$transaction(async (tx) => {
    const existingSalts = await tx.salt.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 2,
    });

    const created = await tx.salt.create({
      data: {
        salt: generateSalt(),
      },
    });

    // Keep the new salt + the previous newest (if exists)
    const previousNewest = existingSalts[0];
    const saltsToKeep = previousNewest
      ? [created.salt, previousNewest.salt]
      : [created.salt];

    await tx.salt.deleteMany({
      where: {
        salt: {
          notIn: saltsToKeep,
        },
      },
    });

    return created;
  });

  getSalts.clear();

  return newSalt;
}

export async function salt() {
  const ALLOWED_RETRIES = 5;
  const BASE_DELAY = 1000;
  const generateNewSaltWithRetry = async (retryCount = 0) => {
    try {
      return await generateNewSalt();
    } catch (error) {
      if (retryCount < ALLOWED_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, BASE_DELAY * 2 ** retryCount),
        );
        return generateNewSaltWithRetry(retryCount + 1);
      }
      throw error;
    }
  };

  return await generateNewSaltWithRetry();
}
