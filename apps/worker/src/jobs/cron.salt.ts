import { generateSalt } from '@openpanel/common/server';
import { db, getCurrentSalt } from '@openpanel/db';
import { getRedisCache } from '@openpanel/redis';

export async function salt() {
  const oldSalt = await getCurrentSalt().catch(() => null);
  const newSalt = await db.salt.create({
    data: {
      salt: generateSalt(),
    },
  });

  // Delete rest of the salts
  await db.salt.deleteMany({
    where: {
      salt: {
        notIn: oldSalt ? [newSalt.salt, oldSalt] : [newSalt.salt],
      },
    },
  });

  await getRedisCache().del('op:salt');

  return newSalt;
}
