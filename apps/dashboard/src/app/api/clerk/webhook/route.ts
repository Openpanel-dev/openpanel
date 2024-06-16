import type { WebhookEvent } from '@clerk/nextjs/server';
import { pathOr } from 'ramda';

import { AccessLevel, db } from '@openpanel/db';

export async function POST(request: Request) {
  const payload: WebhookEvent = await request.json();

  if (payload.type === 'user.created') {
    const email = payload.data.email_addresses[0]?.email_address;

    if (!email) {
      return Response.json(
        { message: 'No email address found' },
        { status: 400 }
      );
    }

    const user = await db.user.create({
      data: {
        id: payload.data.id,
        email,
        firstName: payload.data.first_name,
        lastName: payload.data.last_name,
      },
    });

    const memberships = await db.member.findMany({
      where: {
        email,
        userId: null,
      },
    });

    for (const membership of memberships) {
      const access = pathOr<string[]>([], ['meta', 'access'], membership);
      db.$transaction([
        // Update the member to link it to the user
        // This will remove the item from invitations
        db.member.update({
          where: {
            id: membership.id,
          },
          data: {
            userId: user.id,
          },
        }),
        db.projectAccess.createMany({
          data: access
            .filter((a) => typeof a === 'string')
            .map((projectId) => ({
              organizationSlug: membership.organizationId,
              organizationId: membership.organizationId,
              projectId: projectId,
              userId: user.id,
              level: AccessLevel.read,
            })),
        }),
      ]);
    }
  }

  if (payload.type === 'organizationMembership.created') {
    const access = payload.data.public_metadata.access;
    if (Array.isArray(access)) {
      await db.projectAccess.createMany({
        data: access
          .filter((a): a is string => typeof a === 'string')
          .map((projectId) => ({
            organizationSlug: payload.data.organization.slug,
            organizationId: payload.data.organization.slug,
            projectId: projectId,
            userId: payload.data.public_user_data.user_id,
            level: AccessLevel.read,
          })),
      });
    }
  }

  if (payload.type === 'user.deleted') {
    await db.$transaction([
      db.user.update({
        where: {
          id: payload.data.id,
        },
        data: {
          deletedAt: new Date(),
          firstName: null,
          lastName: null,
          email: `deleted+${payload.data.id}@openpanel.dev`,
        },
      }),
      db.projectAccess.deleteMany({
        where: {
          userId: payload.data.id,
        },
      }),
      db.member.deleteMany({
        where: {
          userId: payload.data.id,
        },
      }),
    ]);
  }

  if (payload.type === 'organizationMembership.deleted') {
    await db.projectAccess.deleteMany({
      where: {
        organizationSlug: payload.data.organization.slug,
        userId: payload.data.public_user_data.user_id,
      },
    });
  }

  return Response.json({ message: 'Webhook received!' });
}

export function GET() {
  return Response.json({ message: 'Hello World!' });
}
