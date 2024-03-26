import type { WebhookEvent } from '@clerk/nextjs/server';

import { AccessLevel, db } from '@openpanel/db';

export async function POST(request: Request) {
  const payload: WebhookEvent = await request.json();

  if (payload.type === 'organizationMembership.created') {
    const access = payload.data.public_metadata.access;
    if (Array.isArray(access)) {
      await db.projectAccess.createMany({
        data: access
          .filter((a): a is string => typeof a === 'string')
          .map((projectId) => ({
            organization_slug: payload.data.organization.slug!,
            project_id: projectId,
            user_id: payload.data.public_user_data.user_id,
            level: AccessLevel.read,
          })),
      });
    }
  }
  if (payload.type === 'organizationMembership.deleted') {
    await db.projectAccess.deleteMany({
      where: {
        organization_slug: payload.data.organization.slug!,
        user_id: payload.data.public_user_data.user_id,
      },
    });
  }

  return Response.json({ message: 'Webhook received!' });
}

export async function GET() {
  return Response.json({ message: 'Hello World!' });
}
