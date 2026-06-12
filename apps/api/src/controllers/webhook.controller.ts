import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { tryCatch } from '@openpanel/common';
import { db, getOrganizationByProjectIdCached } from '@openpanel/db';
import {
  sendSlackNotification,
  slackInstaller,
} from '@openpanel/integrations/src/slack';
import { getProduct, validatePolarEvent } from '@openpanel/payments';
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
  reply: FastifyReply
) {
  const parsedParams = paramsSchema.safeParse(request.query);

  if (!parsedParams.success) {
    request.log.error(parsedParams.error, 'Invalid params');
    return reply.status(400).send({ error: 'Invalid params' });
  }

  const veryfiedState = await slackInstaller.stateStore?.verifyStateParam(
    new Date(),
    parsedParams.data.state
  );
  const parsedMetadata = metadataSchema.safeParse(
    JSON.parse(veryfiedState?.metadata ?? '{}')
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
        'Failed to parse slack auth response'
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
      `${process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL}/${organizationId}/integrations/installed`
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

type PolarEvent = ReturnType<typeof validatePolarEvent>;
type PolarSubscriptionData = Extract<
  PolarEvent,
  { type: 'subscription.updated' }
>['data'];

const subscriptionMetadataSchema = z.object({
  organizationId: z.string(),
  // `userId` is only used for the `subscriptionCreatedByUserId` audit field, so
  // it is optional — a missing one must not block syncing the subscription.
  userId: z.string().optional(),
});

// Org columns whose before→after transition is logged on every sync.
const TRACKED_SUBSCRIPTION_FIELDS = [
  'subscriptionId',
  'subscriptionStatus',
  'subscriptionProductId',
  'subscriptionPriceId',
  'subscriptionStartsAt',
  'subscriptionEndsAt',
  'subscriptionCanceledAt',
  'subscriptionInterval',
  'subscriptionPeriodEventsLimit',
] as const;

const normalizeLogValue = (value: unknown) =>
  value instanceof Date ? value.toISOString() : (value ?? null);

// Builds a `{ field: { from, to } }` map of changed columns. `undefined`
// after-values are skipped — Prisma reads them as "leave the column untouched".
function diffOrganizationFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[]
) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    if (after[field] === undefined) {
      continue;
    }
    const from = normalizeLogValue(before[field]);
    const to = normalizeLogValue(after[field]);
    if (from !== to) {
      changes[field] = { from, to };
    }
  }
  return changes;
}

/**
 * Syncs the full Polar subscription state onto the organization. Used for every
 * `subscription.*` event (created, active, updated, canceled, revoked,
 * past_due, uncanceled) since they all carry the same Subscription object and
 * `status` drives the rest. This covers new subscriptions, cancellations,
 * reactivations, plan changes and payment-state changes in one place.
 */
async function syncSubscriptionToOrg(
  data: PolarSubscriptionData,
  eventType: string,
  log: FastifyRequest['log']
) {
  const metadata = subscriptionMetadataSchema.parse(data.metadata);
  const isCanceled = data.status === 'canceled';

  const organization = await db.organization.findUniqueOrThrow({
    where: {
      id: metadata.organizationId,
    },
  });

  // An organization maps to a single subscription in our DB, but can have
  // several in Polar (e.g. after re-subscribing). A canceled/revoked event for
  // a subscription that is no longer the org's current one must not clobber the
  // newer active subscription.
  if (isCanceled && organization.subscriptionId !== data.id) {
    log.info(
      {
        organizationId: metadata.organizationId,
        eventType,
        eventSubscriptionId: data.id,
        orgSubscriptionId: organization.subscriptionId,
      },
      'polar webhook: ignoring canceled event for non-current subscription'
    );
    return;
  }

  // Polar can deliver subscription events out of order: at renewal the new
  // period can arrive first, then a stale event for the *previous* period lands
  // a few seconds later. A billing period never moves backwards, so for the
  // same subscription we ignore any event whose period starts before the one we
  // already stored — otherwise the stale event resets the org to the expired
  // period and the usage counter (recomputed over that window) gets stuck.
  if (
    organization.subscriptionId === data.id &&
    organization.subscriptionStartsAt &&
    data.currentPeriodStart < organization.subscriptionStartsAt
  ) {
    log.info(
      {
        organizationId: metadata.organizationId,
        eventType,
        eventSubscriptionId: data.id,
        eventPeriodStart: data.currentPeriodStart,
        storedPeriodStart: organization.subscriptionStartsAt,
      },
      'polar webhook: ignoring stale subscription event (older billing period)'
    );
    return;
  }

  const product = await getProduct(data.productId);
  const rawEventsLimit = product.metadata?.eventsLimit;
  const parsedEventsLimit =
    typeof rawEventsLimit === 'number'
      ? rawEventsLimit
      : typeof rawEventsLimit === 'string'
        ? Number(rawEventsLimit)
        : Number.NaN;
  const hasValidEventsLimit = Number.isFinite(parsedEventsLimit);
  const subscriptionPeriodEventsLimit = hasValidEventsLimit
    ? parsedEventsLimit
    : organization.subscriptionPeriodEventsLimit;

  if (!hasValidEventsLimit) {
    log.warn(
      { product },
      'No valid eventsLimit on product, preserving existing organization limit'
    );
  }

  const updateData = {
    subscriptionId: data.id,
    subscriptionCustomerId: data.customer.id,
    subscriptionPriceId: data.prices[0]?.id ?? null,
    subscriptionProductId: data.productId,
    subscriptionStatus: data.status,
    subscriptionStartsAt: data.currentPeriodStart,
    subscriptionCanceledAt: data.canceledAt,
    subscriptionEndsAt: isCanceled
      ? data.cancelAtPeriodEnd
        ? data.currentPeriodEnd
        : data.canceledAt
      : data.currentPeriodEnd,
    subscriptionCreatedByUserId:
      metadata.userId ?? organization.subscriptionCreatedByUserId,
    subscriptionInterval: data.recurringInterval,
    subscriptionPeriodEventsLimit,
    subscriptionPeriodEventsCountExceededAt:
      typeof subscriptionPeriodEventsLimit === 'number' &&
      organization.subscriptionPeriodEventsCountExceededAt &&
      typeof organization.subscriptionPeriodEventsLimit === 'number' &&
      organization.subscriptionPeriodEventsLimit < subscriptionPeriodEventsLimit
        ? null
        : undefined,
  };

  const changes = diffOrganizationFields(
    organization as unknown as Record<string, unknown>,
    updateData as unknown as Record<string, unknown>,
    TRACKED_SUBSCRIPTION_FIELDS
  );

  await db.organization.update({
    where: {
      id: metadata.organizationId,
    },
    data: updateData,
  });

  await clearOrganizationCache(metadata.organizationId);

  await publishEvent('organization', 'subscription_updated', {
    organizationId: metadata.organizationId,
  });

  log.info(
    {
      organizationId: metadata.organizationId,
      eventType,
      subscriptionId: data.id,
      previousStatus: organization.subscriptionStatus,
      status: data.status,
      changes,
    },
    Object.keys(changes).length > 0
      ? `polar webhook: synced subscription for ${metadata.organizationId} (${Object.keys(changes).join(', ')} changed)`
      : `polar webhook: synced subscription for ${metadata.organizationId} (no field changes)`
  );
}

export async function polarWebhook(
  request: FastifyRequest<{
    Querystring: unknown;
  }>,
  reply: FastifyReply
) {
  request.log.info({ body: request.body }, 'polar webhook received');

  const validation = await tryCatch(async () =>
    validatePolarEvent(
      request.rawBody!,
      request.headers as Record<string, string>,
      process.env.POLAR_WEBHOOK_SECRET ?? ''
    )
  );

  if (!validation.ok) {
    request.log.error(
      { err: validation.error },
      'polar webhook: failed to parse event'
    );
    throw validation.error;
  }

  const event = validation.data;

  const eventOrganizationId =
    'metadata' in event.data &&
    event.data.metadata &&
    typeof event.data.metadata === 'object' &&
    'organizationId' in event.data.metadata
      ? String(event.data.metadata.organizationId)
      : undefined;

  const eventCtx = {
    eventType: event.type,
    eventId: 'id' in event.data ? event.data.id : undefined,
    organizationId: eventOrganizationId,
  };

  request.log.info(
    eventCtx,
    `polar webhook: processing ${event.type}${eventOrganizationId ? ` for ${eventOrganizationId}` : ''}`
  );

  if (
    'data' in event &&
    'product' in event.data &&
    event.data.product?.name === 'Supporter'
  ) {
    request.log.info(eventCtx, 'polar webhook: supporter event ignored');
    return reply.status(202).send('OK');
  }

  const handler = await tryCatch(async () => {
    switch (event.type) {
      // A new paid billing cycle resets the org's usage counter. Polar sends
      // `order.updated` (not `order.created`) and the order moves through
      // pending -> paid, so we only act on the `paid` + `subscription_cycle`
      // transition. Re-deliveries of the same paid order just reset to 0 again,
      // which is harmless (and safely under-counts at worst).
      case 'order.updated': {
        if (
          event.data.billingReason !== 'subscription_cycle' ||
          event.data.status !== 'paid'
        ) {
          request.log.info(
            { ...eventCtx, billingReason: event.data.billingReason },
            'polar webhook: order.updated ignored (not a paid billing cycle)'
          );
          return;
        }

        const metadata = z
          .object({
            organizationId: z.string(),
          })
          .parse(event.data.metadata);

        const previous = await db.organization.findUnique({
          where: { id: metadata.organizationId },
          select: { subscriptionPeriodEventsCount: true },
        });

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

        request.log.info(
          {
            ...eventCtx,
            previousEventsCount: previous?.subscriptionPeriodEventsCount,
          },
          `polar webhook: new billing cycle for ${metadata.organizationId}, reset usage counter ${previous?.subscriptionPeriodEventsCount ?? 0} -> 0`
        );
        return;
      }
      // All subscription lifecycle events carry the same Subscription object;
      // sync them through a single path (new subs, cancellations, revokes,
      // reactivations, plan changes, payment-state changes).
      case 'subscription.created':
      case 'subscription.active':
      case 'subscription.updated':
      case 'subscription.uncanceled':
      case 'subscription.canceled':
      case 'subscription.revoked':
      case 'subscription.past_due': {
        await syncSubscriptionToOrg(event.data, event.type, request.log);
        return;
      }
      default: {
        request.log.info(
          eventCtx,
          'polar webhook: unhandled event type, acking'
        );
      }
    }
  });

  if (!handler.ok) {
    request.log.error(
      { err: handler.error, ...eventCtx },
      `polar webhook: ${event.type} handler failed`
    );
    throw handler.error;
  }

  return reply.status(202).send('OK');
}

function isToday(date: Date) {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}
