import fs from 'node:fs';
import path from 'node:path';
import { db } from '@openpanel/db';
import {
  sendSlackNotification,
  slackInstaller,
} from '@openpanel/integrations/src/slack';
import { zSlackAuthResponse } from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

const paramsSchema = z.object({
  code: z.string(),
  state: z.string(),
});

const metadataSchema = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  integrationId: z.string(),
});

export async function slackWebhook(
  request: FastifyRequest<{
    Querystring: unknown;
  }>,
  reply: FastifyReply,
) {
  const parsedParams = paramsSchema.safeParse(request.query);

  if (!parsedParams.success) {
    request.log.error(parsedParams.error, 'Invalid params');
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
    request.log.error(parsedMetadata.error, 'Invalid metadata');
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
      const html = fs.readFileSync(path.join(__dirname, 'error.html'), 'utf8');
      return reply.status(500).header('Content-Type', 'text/html').send(html);
    }

    // Send a notification first to confirm the connection
    await sendSlackNotification({
      webhookUrl: parsedJson.data.incoming_webhook.url,
      message:
        '👋 Hello. You have successfully connected OpenPanel.dev to your Slack workspace.',
    });

    const { projectId, organizationId, integrationId } = parsedMetadata.data;

    await db.integration.update({
      where: {
        id: integrationId,
        organizationId,
      },
      data: {
        config: {
          type: 'slack',
          ...parsedJson.data,
        },
      },
    });

    return reply.redirect(
      `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/${organizationId}/${projectId}/settings/integrations?tab=installed`,
    );
  } catch (err) {
    request.log.error(err);
    const html = fs.readFileSync(path.join(__dirname, 'error.html'), 'utf8');
    return reply.status(500).header('Content-Type', 'text/html').send(html);
  }
}
