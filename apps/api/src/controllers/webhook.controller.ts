import type { WebhookEvent } from '@clerk/fastify';
import { AccessLevel, db } from '@openpanel/db';
import {
  sendSlackNotification,
  slackInstaller,
} from '@openpanel/integrations/src/slack';
import { getRedisPub } from '@openpanel/redis';
import { zSlackAuthResponse } from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pathOr } from 'ramda';
import { Webhook } from 'svix';
import { z } from 'zod';

if (!process.env.CLERK_SIGNING_SECRET) {
  throw new Error('CLERK_SIGNING_SECRET is required');
}

const wh = new Webhook(process.env.CLERK_SIGNING_SECRET);

function verify(body: any, headers: FastifyRequest['headers']) {
  try {
    const svix_id = headers['svix-id'] as string;
    const svix_timestamp = headers['svix-timestamp'] as string;
    const svix_signature = headers['svix-signature'] as string;

    wh.verify(JSON.stringify(body), {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });

    return true;
  } catch (error) {
    return false;
  }
}

export async function clerkWebhook(
  request: FastifyRequest<{
    Body: WebhookEvent;
  }>,
  reply: FastifyReply,
) {
  const payload = request.body;
  const verified = verify(payload, request.headers);

  if (!verified) {
    return reply.send({ message: 'Invalid signature' });
  }

  if (payload.type === 'user.created') {
    const email = payload.data.email_addresses[0]?.email_address;
    const emails = payload.data.email_addresses.map((e) => e.email_address);

    if (!email) {
      return Response.json(
        { message: 'No email address found' },
        { status: 400 },
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
        email: {
          in: emails,
        },
        userId: null,
      },
    });

    for (const membership of memberships) {
      const access = pathOr<string[]>([], ['meta', 'access'], membership);
      await db.$transaction([
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

  reply.send({ success: true });
}

const paramsSchema = z.object({
  code: z.string(),
  state: z.string(),
});

const metadataSchema = z.object({
  organizationId: z.string(),
  integrationId: z.string(),
});

export async function slackWebhook(
  request: FastifyRequest<{
    Querystring: WebhookEvent;
  }>,
  reply: FastifyReply,
) {
  const parsedParams = paramsSchema.safeParse(request.query);

  if (!parsedParams.success) {
    request.log.error('Invalid params', parsedParams);
    return reply.status(400).send({ error: 'Invalid params' });
  }

  const veryfiedState = await slackInstaller.stateStore?.verifyStateParam(
    new Date(),
    parsedParams.data.state,
  );
  const parsedMetadata = metadataSchema.safeParse(
    JSON.parse(veryfiedState?.metadata ?? '{}'),
  );

  if (!parsedMetadata.success) {
    request.log.error('Invalid metadata', parsedMetadata.error.errors);
    return reply.status(400).send({ error: 'Invalid metadata' });
  }

  const slackOauthAccessUrl = [
    'https://slack.com/api/oauth.v2.access',
    `?client_id=${process.env.SLACK_CLIENT_ID}`,
    `&client_secret=${process.env.SLACK_CLIENT_SECRET}`,
    `&code=${parsedParams.data.code}`,
    `&redirect_uri=${process.env.SLACK_OAUTH_REDIRECT_URL}`,
  ].join('');

  try {
    const response = await fetch(slackOauthAccessUrl);
    const json = await response.json();
    const parsedJson = zSlackAuthResponse.safeParse(json);

    if (!parsedJson.success) {
      request.log.error(
        {
          zod: parsedJson,
          json,
        },
        'Failed to parse slack auth response',
      );
      return reply
        .status(400)
        .header('Content-Type', 'text/html')
        .send('<h1>Failed to exchange code for token</h1>');
    }

    // Send a notification first to confirm the connection
    await sendSlackNotification({
      webhookUrl: parsedJson.data.incoming_webhook.url,
      message:
        '👋 Hello. You have successfully connected OpenPanel.dev to your Slack workspace.',
    });

    await db.integration.update({
      where: {
        id: parsedMetadata.data.integrationId,
        organizationId: parsedMetadata.data.organizationId,
      },
      data: {
        config: {
          type: 'slack',
          ...parsedJson.data,
        },
      },
    });

    getRedisPub().publish('integrations:slack', 'ok');

    reply.send({ success: true });
  } catch (err) {
    request.log.error(err);
    return reply
      .status(500)
      .header('Content-Type', 'text/html')
      .send('<h1>Failed to exchange code for token</h1>');
  }
}
