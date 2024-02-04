import { generateSalt } from '@mixan/common';
import { db, getCurrentSalt } from '@mixan/db';

export async function salt() {
  const oldSalt = await getCurrentSalt();
  const newSalt = await db.salt.create({
    data: {
      salt: generateSalt(),
    },
  });

  // Delete rest of the salts
  await db.salt.deleteMany({
    where: {
      salt: {
        notIn: [newSalt.salt, oldSalt],
      },
    },
  });

  return newSalt;
}
