import fs from 'node:fs';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { db, getOrganizationByProjectIdCached } from '@openpanel/db';
import {
  sendSlackNotification,
  slackInstaller,
} from '@openpanel/integrations/src/slack';
import {
  PolarWebhookVerificationError,
  getProduct,
  validatePolarEvent,
} from '@openpanel/payments';
import { publishEvent } from '@openpanel/redis';
import { zSlackAuthResponse } from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

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

    const { organizationId, integrationId } = parsedMetadata.data;

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
      `${process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL}/${organizationId}/integrations/installed`,
    );
  } catch (err) {
    request.log.error(err);
    const html = fs.readFileSync(path.join(__dirname, 'error.html'), 'utf8');
    return reply.status(500).header('Content-Type', 'text/html').send(html);
  }
}

async function clearOrganizationCache(organizationId: string) {
  const projects = await db.project.findMany({
    where: {
      organizationId,
    },
  });
  for (const project of projects) {
    await getOrganizationByProjectIdCached.clear(project.id);
  }
}

export async function polarWebhook(
  request: FastifyRequest<{
    Querystring: unknown;
  }>,
  reply: FastifyReply,
) {
  try {
    const event = validatePolarEvent(
      request.rawBody!,
      request.headers as Record<string, string>,
      process.env.POLAR_WEBHOOK_SECRET ?? '',
    );

    switch (event.type) {
      case 'order.created': {
        const metadata = z
          .object({
            organizationId: z.string(),
          })
          .parse(event.data.metadata);

        if (event.data.billingReason === 'subscription_cycle') {
          await db.organization.update({
            where: {
              id: metadata.organizationId,
            },
            data: {
              subscriptionPeriodEventsCount: 0,
              subscriptionPeriodEventsCountExceededAt: null,
            },
          });

          await clearOrganizationCache(metadata.organizationId);
        }
        break;
      }
      case 'subscription.updated': {
        const metadata = z
          .object({
            organizationId: z.string(),
            userId: z.string(),
          })
          .parse(event.data.metadata);

        const product = await getProduct(event.data.productId);
        const eventsLimit = product.metadata?.eventsLimit;
        const subscriptionPeriodEventsLimit =
          typeof eventsLimit === 'number' ? eventsLimit : undefined;

        if (!subscriptionPeriodEventsLimit) {
          request.log.warn('No events limit found for product', { product });
        }

        // If we get a cancel event and we cant find it we should ignore it
        // Since we only have one subscription per organization but you can have several in polar
        // we dont want to override the existing subscription with a canceled one
        // TODO: might be other events that we should handle like this?!
        if (event.data.status === 'canceled') {
          const orgSubscription = await db.organization.findFirst({
            where: {
              subscriptionCustomerId: event.data.customer.id,
              subscriptionId: event.data.id,
              subscriptionStatus: 'active',
            },
          });

          if (!orgSubscription) {
            return reply.status(202).send('OK');
          }
        }

        await db.organization.update({
          where: {
            id: metadata.organizationId,
          },
          data: {
            subscriptionId: event.data.id,
            subscriptionCustomerId: event.data.customer.id,
            subscriptionPriceId: event.data.prices[0]?.id ?? null,
            subscriptionProductId: event.data.productId,
            subscriptionStatus: event.data.status,
            subscriptionStartsAt: event.data.currentPeriodStart,
            subscriptionCanceledAt: event.data.canceledAt,
            subscriptionEndsAt:
              event.data.status === 'canceled'
                ? event.data.cancelAtPeriodEnd
                  ? event.data.currentPeriodEnd
                  : event.data.canceledAt
                : event.data.currentPeriodEnd,
            subscriptionCreatedByUserId: metadata.userId,
            subscriptionInterval: event.data.recurringInterval,
            subscriptionPeriodEventsLimit,
          },
        });

        await clearOrganizationCache(metadata.organizationId);

        await publishEvent('organization', 'subscription_updated', {
          organizationId: metadata.organizationId,
        });

        break;
      }
    }

    reply.status(202).send('OK');
  } catch (error) {
    if (error instanceof PolarWebhookVerificationError) {
      request.log.error('Polar webhook error', { error });
      reply.status(403).send('');
    }

    throw error;
  }
}

function isToday(date: Date) {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}
