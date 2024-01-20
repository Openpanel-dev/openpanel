import { randomUUID } from 'crypto';
import { db, getId } from '@/server/db';
import { handleError } from '@/server/exceptions';
import { hashPassword } from '@/server/services/hash.service';
import type { NextApiRequest, NextApiResponse } from 'next';

const userName = 'Admin';
const userPassword = 'password';
const userEmail = 'acme@acme.com';
const organizationName = 'Acme Inc.';
const projectName = 'Website';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const counts = await db.$transaction([
      db.user.count(),
      db.organization.count(),
      db.project.count(),
      db.client.count(),
    ]);

    if (counts.some((count) => count > 0)) {
      return res.json('Setup already done');
    }

    const organization = await db.organization.create({
      data: {
        id: await getId('organization', organizationName),
        name: organizationName,
      },
    });

    const user = await db.user.create({
      data: {
        name: userName,
        password: await hashPassword(userPassword),
        email: userEmail,
        organization_id: organization.id,
      },
    });

    const project = await db.project.create({
      data: {
        id: await getId('project', projectName),
        name: projectName,
        organization_id: organization.id,
      },
    });
    const secret = randomUUID();
    const client = await db.client.create({
      data: {
        name: `${projectName} Client`,
        project_id: project.id,
        organization_id: organization.id,
        secret: await hashPassword(secret),
      },
    });

    res.json({
      clientId: client.id,
      clientSecret: secret,
      user,
    });
  } catch (error) {
    handleError(res, error);
  }
}
