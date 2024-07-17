import { generateSalt } from '@openpanel/common';
import { db, getCurrentSalt } from '@openpanel/db';

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

  return newSalt;
}
