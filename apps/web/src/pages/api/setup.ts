import { randomUUID } from 'crypto';
import { db } from '@/server/db';
import { handleError } from '@/server/exceptions';
import { hashPassword } from '@/server/services/hash.service';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const counts = await db.$transaction([
      db.organization.count(),
      db.project.count(),
      db.client.count(),
    ]);

    if (counts.some((count) => count > 0)) {
      return res.json('Setup already done');
    }

    const organization = await db.organization.create({
      data: {
        name: 'Acme Inc.',
      },
    });

    const project = await db.project.create({
      data: {
        name: 'Acme Website',
        organization_id: organization.id,
      },
    });
    const secret = randomUUID();
    const client = await db.client.create({
      data: {
        name: 'Acme Website Client',
        project_id: project.id,
        organization_id: organization.id,
        secret: await hashPassword(secret),
      },
    });

    res.json({
      clientId: client.id,
      clientSecret: secret,
    });
  } catch (error) {
    handleError(res, error);
  }
}
