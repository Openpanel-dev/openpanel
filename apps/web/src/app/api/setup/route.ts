import { randomUUID } from 'crypto';
import { db, getId } from '@/server/db';
import { hashPassword } from '@/server/services/hash.service';
import { NextResponse } from 'next/server';

const userName = 'demo';
const userPassword = 'demo';
const userEmail = 'demo@demo.com';
const organizationName = 'Demo Org';
const projectName = 'Demo Project';

export async function GET() {
  try {
    const counts = await db.$transaction([
      db.user.count(),
      db.organization.count(),
      db.project.count(),
      db.client.count(),
    ]);

    if (counts.some((count) => count > 0)) {
      return NextResponse.json({ message: 'Already setup' });
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

    return NextResponse.json({
      clientId: client.id,
      clientSecret: secret,
      user,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to setup' });
  }
}
