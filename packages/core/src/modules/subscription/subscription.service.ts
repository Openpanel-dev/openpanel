// Moved from packages/trpc/src/routers/subscription.ts (checkout, products,
// usage, cancel/pause/resume, save-discount, portal) and from
// apps/api/src/controllers/webhook.controller.ts's `polarWebhook` (M6-006).
// V1's router and controller stay the LIVE routes (DELEGATE PATTERN) and
// delegate every handler body to these functions, same as every other
// dissolved service in this package.
//
// `requireOrganizationAdmin` travels with the business logic here rather than
// living in subscription.rpc.ts the way project.rpc.ts's simple ladder checks
// do: every mutating procedure in this module gates on it first, before
// touching Polar. `requireOrganizationAdmin` comes from auth.service.ts's
// single, lazily-memoized `getAccessChecks()` (M10-002) — independent of
// `ServiceDeps`, so it needs no change here.
//
// M10-004: every function takes `ServiceDeps` and reaches Postgres as
// `deps.db`; the `loadDb()`/`loadPrisma()` lazy loaders are gone.
// `Prisma.DbNull` (the JSON-column null sentinel) has no home on `deps` — it
// is a plain value on the namespace, not the client — so it is reached
// through `context.ts`'s `prismaSentinels()` instead of importing
// `@openpanel/db` here.

import {
  applySubscriptionDiscount,
  cancelSubscription as cancelPolarSubscription,
  changeSubscription,
  createCheckout,
  createPortal,
  getProduct,
  getProducts,
  pauseSubscription as pausePolarSubscription,
  reactivateSubscription,
  resumeSubscription as resumePolarSubscription,
  unpauseSubscription,
  validatePolarEvent,
} from '@openpanel/payments';
import { getCache, publishEvent } from '@openpanel/redis';
import { addMonths, subDays } from 'date-fns';
import { z } from 'zod';
import type { Logger } from '../../logger';
import { TRPCBadRequestError } from '../../rpc/errors';
import type { ServiceDeps, Services } from '../../services';
import { getAccessChecks } from '../auth/auth.service';
import {
  getOrganizationBillingEventsCountSerieCached,
  getOrganizationById,
  getOrganizationByProjectIdCached,
} from '../organization/organization.service';
import {
  type ICancellationReason,
  type ICancelSubscription,
  type ICheckout,
  type IPauseSubscription,
  zCancellationReason,
} from './subscription.constants';

/** Lazy: `context.ts` value-imports `services.ts`, so a static import here
 *  would put the whole service graph in this module's import graph — and this
 *  module is part of that graph. */
function loadPrismaSentinels() {
  return import('../../context').then((m) => m.prismaSentinels());
}

const POLAR_PRODUCTS_CACHE_KEY = 'polar:products';
const POLAR_PRODUCTS_CACHE_TTL_SECONDS = 60 * 60 * 24;
const DEFAULT_USAGE_WINDOW_DAYS = 30;

export async function getCurrentSubscriptionProduct(
  deps: ServiceDeps,
  organizationId: string
) {
  const organization = await getOrganizationById(deps, organizationId);

  if (!organization.subscriptionProductId) {
    return null;
  }

  return getProduct(organization.subscriptionProductId);
}

export async function checkout(
  deps: ServiceDeps,
  userId: string,
  input: ICheckout,
  ipAddress: string | undefined
) {
  const { requireOrganizationAdmin } = await getAccessChecks();
  await requireOrganizationAdmin({
    userId,
    organizationId: input.organizationId,
  });

  const [user, organization] = await Promise.all([
    deps.db.user.findFirstOrThrow({ where: { id: userId } }),
    deps.db.organization.findFirstOrThrow({
      where: { id: input.organizationId },
    }),
  ]);

  // A paused (or pause-scheduled) subscription still exists in Polar — a
  // checkout here would create a second one, and a plan change would race
  // the pending pause. Resume first, then change plans.
  if (
    organization.subscriptionId &&
    (organization.subscriptionStatus === 'paused' ||
      organization.subscriptionPauseAtPeriodEnd)
  ) {
    throw new TRPCBadRequestError(
      'Your subscription is paused or scheduled to pause — resume it before changing plans'
    );
  }

  // An organization has at most one Polar subscription (we have no free
  // tier in Polar — the free plan is handled on our side). So an upgrade or
  // downgrade is an in-place product change, never a cancel + re-subscribe.
  // Reactivate first if it was scheduled to cancel, otherwise change the
  // product on the existing subscription.
  if (
    organization.subscriptionId &&
    organization.subscriptionStatus === 'active'
  ) {
    if (organization.subscriptionCanceledAt) {
      await reactivateSubscription(organization.subscriptionId);
      return null;
    }

    // Already on this product — nothing to change.
    if (organization.subscriptionProductId === input.productId) {
      return null;
    }

    await changeSubscription(organization.subscriptionId, input.productId);
    return null;
  }

  const checkoutSession = await createCheckout({
    productId: input.productId,
    organizationId: input.organizationId,
    user,
    ipAddress,
  });

  return { url: checkoutSession.url };
}

export async function listProducts(deps: ServiceDeps, organizationId: string) {
  const organization = await deps.db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { subscriptionPeriodEventsCount: true },
  });

  return (
    await getCache(
      POLAR_PRODUCTS_CACHE_KEY,
      POLAR_PRODUCTS_CACHE_TTL_SECONDS,
      () => getProducts()
    )
  ).map((product) => {
    const eventsLimit = product.metadata.eventsLimit;
    return {
      ...product,
      disabled:
        typeof eventsLimit === 'number' &&
        organization.subscriptionPeriodEventsCount >= eventsLimit
          ? 'This product is not applicable since you have exceeded the limits for this subscription.'
          : null,
    };
  });
}

export async function getUsage(deps: ServiceDeps, organizationId: string) {
  const organization = await deps.db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: { projects: { select: { id: true } } },
  });

  if (
    organization.hasSubscription &&
    organization.subscriptionStartsAt &&
    organization.subscriptionEndsAt
  ) {
    return getOrganizationBillingEventsCountSerieCached(deps, organization, {
      startDate: organization.subscriptionStartsAt,
      endDate: organization.subscriptionEndsAt,
    });
  }

  return getOrganizationBillingEventsCountSerieCached(deps, organization, {
    startDate: subDays(new Date(), DEFAULT_USAGE_WINDOW_DAYS),
    endDate: new Date(),
  });
}

export async function cancelSubscription(
  deps: ServiceDeps,
  userId: string,
  input: ICancelSubscription
) {
  const { requireOrganizationAdmin } = await getAccessChecks();
  await requireOrganizationAdmin({
    userId,
    organizationId: input.organizationId,
  });

  const organization = await getOrganizationById(deps, input.organizationId);
  if (!organization.subscriptionId) {
    throw new TRPCBadRequestError('Organization has no subscription');
  }

  const res = await cancelPolarSubscription(organization.subscriptionId, {
    reason: input.reason,
    comment: input.comment,
  });

  // The webhook echoes these back, but persist immediately so a missed or
  // delayed delivery can't lose the reason — or leave `canceledAt` unset,
  // which would make the plan-change path skip reactivation and silently
  // keep the cancellation scheduled.
  await deps.db.organization.update({
    where: { id: input.organizationId },
    data: {
      subscriptionCancelReason: input.reason,
      subscriptionCancelComment: input.comment ?? null,
      subscriptionCanceledAt: res.canceledAt,
      subscriptionEndsAt: res.cancelAtPeriodEnd
        ? res.currentPeriodEnd
        : (res.canceledAt ?? organization.subscriptionEndsAt),
    },
  });

  return res;
}

export async function pauseSubscription(
  deps: ServiceDeps,
  userId: string,
  input: IPauseSubscription
) {
  const { requireOrganizationAdmin } = await getAccessChecks();
  await requireOrganizationAdmin({
    userId,
    organizationId: input.organizationId,
  });

  const organization = await getOrganizationById(deps, input.organizationId);
  if (!organization.subscriptionId) {
    throw new TRPCBadRequestError('Organization has no subscription');
  }
  // Only a plain active subscription can be paused — this rejects paused,
  // pause-scheduled (pausing), canceling, canceled, unpaid, etc. before we
  // hit Polar with a nonsensical update.
  if (organization.subscriptionState !== 'active') {
    throw new TRPCBadRequestError('Only an active subscription can be paused');
  }
  if (!organization.subscriptionEndsAt) {
    throw new TRPCBadRequestError('Subscription has no current period end');
  }

  // Polar pauses at period end; the resume date counts from there.
  const resumesAt = addMonths(organization.subscriptionEndsAt, input.months);

  await pausePolarSubscription(organization.subscriptionId, resumesAt);

  // Optimistic mirror — the subscription.updated webhook confirms it.
  await deps.db.organization.update({
    where: { id: input.organizationId },
    data: {
      subscriptionPauseAtPeriodEnd: true,
      subscriptionResumesAt: resumesAt,
    },
  });

  return { resumesAt };
}

export async function resumeSubscription(
  deps: ServiceDeps,
  userId: string,
  organizationId: string
) {
  const { requireOrganizationAdmin } = await getAccessChecks();
  await requireOrganizationAdmin({ userId, organizationId });

  const organization = await getOrganizationById(deps, organizationId);
  if (!organization.subscriptionId) {
    throw new TRPCBadRequestError('Organization has no subscription');
  }

  if (organization.subscriptionStatus === 'paused') {
    // Already paused — resuming starts a new billing period immediately.
    await resumePolarSubscription(organization.subscriptionId);
  } else if (organization.subscriptionPauseAtPeriodEnd) {
    // Pause is only scheduled — just clear it.
    await unpauseSubscription(organization.subscriptionId);
  } else {
    throw new TRPCBadRequestError('Subscription is not paused');
  }

  await deps.db.organization.update({
    where: { id: organizationId },
    data: {
      subscriptionPauseAtPeriodEnd: false,
      subscriptionResumesAt: null,
    },
  });

  return { success: true };
}

export async function applySaveDiscount(
  deps: ServiceDeps,
  userId: string,
  organizationId: string
) {
  const { requireOrganizationAdmin } = await getAccessChecks();
  await requireOrganizationAdmin({ userId, organizationId });

  const discountId = process.env.POLAR_SAVE_DISCOUNT_ID;
  if (!discountId) {
    throw new TRPCBadRequestError('Save discount is not configured');
  }

  const organization = await getOrganizationById(deps, organizationId);
  if (!organization.subscriptionId) {
    throw new TRPCBadRequestError('Organization has no subscription');
  }

  // Claim the one-time offer atomically BEFORE calling Polar: a
  // conditional update lets exactly one concurrent request through. Roll
  // the claim back if Polar rejects, so a transient failure doesn't burn
  // the offer.
  const claimed = await deps.db.organization.updateMany({
    where: { id: organizationId, subscriptionSaveDiscountAppliedAt: null },
    data: { subscriptionSaveDiscountAppliedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new TRPCBadRequestError('The save discount has already been used');
  }

  try {
    await applySubscriptionDiscount(organization.subscriptionId, discountId);
  } catch (error) {
    await deps.db.organization.updateMany({
      where: { id: organizationId },
      data: { subscriptionSaveDiscountAppliedAt: null },
    });
    throw error;
  }

  return { success: true };
}

export async function portal(
  deps: ServiceDeps,
  userId: string,
  organizationId: string
) {
  const { requireOrganizationAdmin } = await getAccessChecks();
  await requireOrganizationAdmin({ userId, organizationId });

  const organization = await getOrganizationById(deps, organizationId);
  if (!organization.subscriptionCustomerId) {
    throw new TRPCBadRequestError('Organization has no subscription');
  }

  const created = await createPortal({
    customerId: organization.subscriptionCustomerId,
  });

  return { url: created.customerPortalUrl };
}

// -- Polar webhook --------------------------------------------------------
// Ported from apps/api/src/controllers/webhook.controller.ts's `polarWebhook`
// + its private helpers (M6-006). V1's Fastify controller stays the LIVE
// route (DELEGATE PATTERN) and delegates here — the same function this
// module's own `/webhook/polar` route (subscription.routes.ts) calls.
// `validatePolarEvent` verifies the signature over the RAW body bytes; any
// body parsing before this call breaks that verification, which is why both
// callers read `await request.text()` / `request.rawBody` rather than a
// parsed JSON body.

type PolarEvent = ReturnType<typeof validatePolarEvent>;
type PolarSubscriptionData = Extract<
  PolarEvent,
  { type: 'subscription.updated' }
>['data'];
type PolarSubscriptionDiscount = PolarSubscriptionData['discount'];

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
  'subscriptionCancelReason',
  'subscriptionInterval',
  'subscriptionPeriodEventsLimit',
  'subscriptionPauseAtPeriodEnd',
  'subscriptionResumesAt',
  'subscriptionFirstStartedAt',
] as const;

// Polar types the reason as an open enum (unknown strings can appear); only
// store values our own union knows about.
function parseCancellationReason(
  reason: string | null | undefined
): ICancellationReason | null {
  const parsed = zCancellationReason.safeParse(reason);
  return parsed.success ? parsed.data : null;
}

// Compact summary of Polar's embedded discount object so the dashboard can
// show that a discount is active (save offer or any Polar discount code).
export function toSubscriptionDiscount(
  discount: PolarSubscriptionDiscount
): PrismaJson.IPrismaSubscriptionDiscount | null {
  if (!discount) {
    return null;
  }
  return {
    id: discount.id,
    name: discount.name,
    type: discount.type === 'fixed' ? 'fixed' : 'percentage',
    basisPoints: 'basisPoints' in discount ? discount.basisPoints : null,
    amount: 'amount' in discount ? discount.amount : null,
    currency: 'currency' in discount ? discount.currency : null,
    duration:
      discount.duration === 'repeating'
        ? 'repeating'
        : discount.duration === 'forever'
          ? 'forever'
          : 'once',
    durationInMonths:
      'durationInMonths' in discount ? discount.durationInMonths : null,
  };
}

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

async function clearOrganizationCache(
  deps: ServiceDeps,
  organizationId: string
) {
  const projects = await deps.db.project.findMany({
    where: { organizationId },
  });
  for (const project of projects) {
    await getOrganizationByProjectIdCached.clear(deps, project.id);
  }
}

/**
 * Syncs the full Polar subscription state onto the organization. Used for every
 * `subscription.*` event (created, active, updated, canceled, revoked,
 * past_due, uncanceled) since they all carry the same Subscription object and
 * `status` drives the rest. This covers new subscriptions, cancellations,
 * reactivations, plan changes and payment-state changes in one place.
 */
async function syncSubscriptionToOrg(
  deps: ServiceDeps,
  data: PolarSubscriptionData,
  eventType: string,
  logger: Logger
) {
  const metadata = subscriptionMetadataSchema.parse(data.metadata);
  const isCanceled = data.status === 'canceled';

  const organization = await deps.db.organization.findUniqueOrThrow({
    where: { id: metadata.organizationId },
  });

  // An organization maps to a single subscription in our DB, but can have
  // several in Polar (e.g. after re-subscribing). A canceled/revoked event for
  // a subscription that is no longer the org's current one must not clobber the
  // newer active subscription.
  if (isCanceled && organization.subscriptionId !== data.id) {
    logger.info(
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
    logger.info(
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
    logger.warn(
      { product },
      'No valid eventsLimit on product, preserving existing organization limit'
    );
  }

  const { DbNull } = await loadPrismaSentinels();

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
    subscriptionInterval: data.recurringInterval,
    // Cancellation feedback + pause state mirror Polar so portal-driven cancels
    // and pauses are captured too (our in-app flows also set them via the API,
    // which just echoes back through here).
    subscriptionCancelReason: parseCancellationReason(
      data.customerCancellationReason
    ),
    subscriptionCancelComment: data.customerCancellationComment ?? null,
    subscriptionPauseAtPeriodEnd: data.pauseAtPeriodEnd,
    subscriptionResumesAt: data.resumesAt,
    subscriptionDiscount: toSubscriptionDiscount(data.discount) ?? DbNull,
    // Stable tenure anchor: keep the stored value while the subscription id is
    // unchanged; a new subscription (re-subscribe) restarts tenure.
    subscriptionFirstStartedAt:
      organization.subscriptionId === data.id
        ? (organization.subscriptionFirstStartedAt ?? data.createdAt)
        : data.createdAt,
    subscriptionPeriodEventsLimit,
    subscriptionPeriodEventsCountExceededAt:
      typeof subscriptionPeriodEventsLimit === 'number' &&
      organization.subscriptionPeriodEventsCountExceededAt &&
      typeof organization.subscriptionPeriodEventsLimit === 'number' &&
      organization.subscriptionPeriodEventsLimit < subscriptionPeriodEventsLimit
        ? null
        : undefined,
    // A raised limit re-arms the usage alerts for the new headroom.
    ...(typeof subscriptionPeriodEventsLimit === 'number' &&
    typeof organization.subscriptionPeriodEventsLimit === 'number' &&
    organization.subscriptionPeriodEventsLimit < subscriptionPeriodEventsLimit
      ? { usageWarningSentAt: null, usageExceededSentAt: null }
      : {}),
    // Reaching checkout takes the org out of the wind-down population for good
    // — that sequence only targets trials that never had a subscription — so
    // release the ingestion block and any scheduled deletion. Guarded on the
    // org actually being in wind-down so we never clear a `deleteAt` the owner
    // set themselves. The wind-down cron re-checks this too, for the webhook we
    // never receive.
    ...(organization.windDownStartedAt
      ? { windDownStartedAt: null, windDownStep: null, deleteAt: null }
      : {}),
  };

  const changes = diffOrganizationFields(
    organization as unknown as Record<string, unknown>,
    updateData as unknown as Record<string, unknown>,
    TRACKED_SUBSCRIPTION_FIELDS
  );

  await deps.db.organization.update({
    where: { id: metadata.organizationId },
    data: updateData,
  });

  await clearOrganizationCache(deps, metadata.organizationId);

  await publishEvent('organization', 'subscription_updated', {
    organizationId: metadata.organizationId,
  });

  logger.info(
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

/**
 * Handles one verified Polar webhook event. `rawBody`/`headers` MUST be the
 * unparsed request bytes — `validatePolarEvent` verifies the signature over
 * them, and any body parsing upstream (JSON, form, anything) breaks that
 * verification. `apps/api`'s Fastify controller (via `fastify-raw-body`) and
 * this module's own Elysia route (via `request.text()`) both preserve this.
 */
export async function handlePolarWebhookEvent(
  deps: ServiceDeps,
  rawBody: string | Buffer,
  headers: Record<string, string>,
  logger: Logger
): Promise<void> {
  // Don't log the raw body: it can carry customer free text (e.g. the
  // cancellation comment) that the logger's redaction patterns don't cover.
  // `eventCtx` is logged right after validation instead.
  logger.info('polar webhook received');

  let event: PolarEvent;
  try {
    event = validatePolarEvent(
      rawBody,
      headers,
      process.env.POLAR_WEBHOOK_SECRET ?? ''
    );
  } catch (err) {
    logger.error({ err }, 'polar webhook: failed to parse event');
    throw err;
  }

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

  logger.info(
    eventCtx,
    `polar webhook: processing ${event.type}${eventOrganizationId ? ` for ${eventOrganizationId}` : ''}`
  );

  if (
    'data' in event &&
    'product' in event.data &&
    event.data.product?.name === 'Supporter'
  ) {
    logger.info(eventCtx, 'polar webhook: supporter event ignored');
    return;
  }

  try {
    await dispatchPolarWebhookEvent(deps, event, eventCtx, logger);
  } catch (err) {
    logger.error(
      { err, ...eventCtx },
      `polar webhook: ${event.type} handler failed`
    );
    throw err;
  }
}

async function dispatchPolarWebhookEvent(
  deps: ServiceDeps,
  event: PolarEvent,
  eventCtx: {
    eventType: string;
    eventId: unknown;
    organizationId: string | undefined;
  },
  logger: Logger
): Promise<void> {
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
        logger.info(
          { ...eventCtx, billingReason: event.data.billingReason },
          'polar webhook: order.updated ignored (not a paid billing cycle)'
        );
        return;
      }

      const metadata = z
        .object({ organizationId: z.string() })
        .parse(event.data.metadata);

      const previous = await deps.db.organization.findUnique({
        where: { id: metadata.organizationId },
        select: { subscriptionPeriodEventsCount: true },
      });

      await deps.db.organization.update({
        where: { id: metadata.organizationId },
        data: {
          subscriptionPeriodEventsCount: 0,
          subscriptionPeriodEventsCountExceededAt: null,
          // New cycle — the usage alerts may fire again.
          usageWarningSentAt: null,
          usageExceededSentAt: null,
        },
      });

      await clearOrganizationCache(deps, metadata.organizationId);

      logger.info(
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
    // Pause/resume transitions arrive via `subscription.updated` (the SDK's
    // webhook union has no dedicated paused/reactivated payloads yet) and are
    // reflected in `status` / `pauseAtPeriodEnd` / `resumesAt` below.
    case 'subscription.created':
    case 'subscription.active':
    case 'subscription.updated':
    case 'subscription.uncanceled':
    case 'subscription.canceled':
    case 'subscription.revoked':
    case 'subscription.past_due': {
      await syncSubscriptionToOrg(deps, event.data, event.type, logger);
      return;
    }
    default: {
      logger.info(eventCtx, 'polar webhook: unhandled event type, acking');
    }
  }
}

export function createSubscriptionService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    getCurrentSubscriptionProduct: (
      organizationId: string
    ): ReturnType<typeof getCurrentSubscriptionProduct> =>
      getCurrentSubscriptionProduct(deps, organizationId),
    checkout: (
      userId: string,
      input: ICheckout,
      ipAddress: string | undefined
    ): ReturnType<typeof checkout> => checkout(deps, userId, input, ipAddress),
    listProducts: (organizationId: string): ReturnType<typeof listProducts> =>
      listProducts(deps, organizationId),
    getUsage: (organizationId: string): ReturnType<typeof getUsage> =>
      getUsage(deps, organizationId),
    cancelSubscription: (
      userId: string,
      input: ICancelSubscription
    ): ReturnType<typeof cancelSubscription> =>
      cancelSubscription(deps, userId, input),
    pauseSubscription: (
      userId: string,
      input: IPauseSubscription
    ): ReturnType<typeof pauseSubscription> =>
      pauseSubscription(deps, userId, input),
    resumeSubscription: (
      userId: string,
      organizationId: string
    ): ReturnType<typeof resumeSubscription> =>
      resumeSubscription(deps, userId, organizationId),
    applySaveDiscount: (
      userId: string,
      organizationId: string
    ): ReturnType<typeof applySaveDiscount> =>
      applySaveDiscount(deps, userId, organizationId),
    portal: (
      userId: string,
      organizationId: string
    ): ReturnType<typeof portal> => portal(deps, userId, organizationId),
    handlePolarWebhookEvent: (
      rawBody: string | Buffer,
      headers: Record<string, string>,
      logger: Logger
    ): Promise<void> => handlePolarWebhookEvent(deps, rawBody, headers, logger),
  };
}
