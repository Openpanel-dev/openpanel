import { generateSalt } from '@openpanel/common/server';

import { getRedisCache } from '@openpanel/redis';
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
  const cache = await getRedisCache().get('op:salt');
  if (cache) {
    return JSON.parse(cache);
  }

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
    throw new Error('No salt found');
  }

  const salts = {
    current: curr.salt,
    previous: prev.salt,
  };

  await getRedisCache().set('op:salt', JSON.stringify(salts), 'EX', 60 * 10);

  return salts;
}

export async function createInitialSalts() {
  const MAX_RETRIES = 5;
  const BASE_DELAY = 1000; // 1 second
  const createSaltsWithRetry = async (retryCount = 0): Promise<void> => {
    try {
      await getSalts();
    } catch (error) {
      if (error instanceof Error && error.message === 'No salt found') {
        console.log('Creating salts for the first time');
        await db.salt.create({
          data: {
            salt: generateSalt(),
            createdAt: new Date(new Date().getTime() - 1000 * 60 * 60 * 24),
          },
        });
        await db.salt.create({
          data: {
            salt: generateSalt(),
          },
        });
      } else {
        console.log('Error getting salts', error);
        if (retryCount < MAX_RETRIES) {
          const delay = BASE_DELAY * 2 ** retryCount;
          console.log(
            `Retrying in ${delay}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return createSaltsWithRetry(retryCount + 1);
        }
        throw new Error(`Failed to create salts after ${MAX_RETRIES} attempts`);
      }
    }
  };

  await createSaltsWithRetry();
}
