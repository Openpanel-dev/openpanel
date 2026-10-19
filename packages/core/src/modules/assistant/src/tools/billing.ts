import { FREE_PRODUCT_IDS } from '@openpanel/payments';
import { getSubscriptionState } from '@openpanel/payments/subscription-state';
import { getSubscriptionStateMeta } from '@openpanel/payments/subscription-state-meta';
import { tool } from 'ai';
import { z } from 'zod';
import { getCurrentSubscriptionProduct } from '../../../subscription/subscription.service';
import type { ChatToolContext } from '../context';

const CENTS_PER_UNIT = 100;
const PERCENT = 100;

interface PriceLike {
  priceAmount?: number;
  priceCurrency?: string;
}

export interface BillingOutput {
  selfHosted: boolean;
  organization: string;
  state: string;
  statusLine: string | null;
  plan: {
    name: string | null;
    free: boolean;
    price: number | null;
    currency: string | null;
    interval: string | null;
    eventsLimit: number | null;
  };
  usage: {
    eventsThisPeriod: number;
    eventsLimit: number | null;
    percentUsed: number | null;
    periodStart: string | null;
    periodEnd: string | null;
    limitExceededAt: string | null;
  };
  schedule: {
    canceledAt: string | null;
    pauseAtPeriodEnd: boolean;
    resumesAt: string | null;
  };
  billingUrl: string;
}

const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;

interface PlanOption {
  productId: string;
  productPriceId: string | null;
  name: string;
  eventsLimit: number | null;
  price: number | null;
  currency: string | null;
  interval: string | null;
  current: boolean;
  unavailable: string | null;
}

export function billingTools(ctx: ChatToolContext) {
  const { deps, organizationId, actions } = ctx;
  const billingUrl = `${ctx.config.dashboardUrl.replace(/\/$/, '')}/${organizationId}/settings`;

  return {
    get_billing: tool({
      description:
        "The workspace's plan and usage: which plan, its price and event limit, events used this billing period, renewal or trial end date, and whether it is canceling or paused. Use for any question about the plan, billing, limits or usage. Self-hosted installs have no billing.",
      inputSchema: z.object({}),
      execute: async (): Promise<
        BillingOutput | { selfHosted: true; message: string }
      > => {
        if (ctx.config.selfHosted) {
          return {
            selfHosted: true,
            message:
              'This is a self-hosted install; there is no plan or billing.',
          };
        }
        const organization = await deps.db.organization.findUniqueOrThrow({
          where: { id: organizationId },
          select: {
            name: true,
            subscriptionProductId: true,
            subscriptionStatus: true,
            subscriptionStartsAt: true,
            subscriptionEndsAt: true,
            subscriptionCanceledAt: true,
            subscriptionPauseAtPeriodEnd: true,
            subscriptionResumesAt: true,
            subscriptionInterval: true,
            subscriptionPeriodEventsCount: true,
            subscriptionPeriodEventsLimit: true,
            subscriptionPeriodEventsCountExceededAt: true,
          },
        });
        const state = getSubscriptionState(organization);
        const meta = getSubscriptionStateMeta(state, {
          endsAt: organization.subscriptionEndsAt,
          canceledAt: organization.subscriptionCanceledAt,
          resumesAt: organization.subscriptionResumesAt,
        });
        const product = organization.subscriptionProductId
          ? await getCurrentSubscriptionProduct(deps, organizationId).catch(
              () => null
            )
          : null;
        const price = (product?.prices?.[0] ?? null) as PriceLike | null;
        const productLimit = Number(product?.metadata?.eventsLimit);
        const eventsLimit =
          Number.isFinite(productLimit) && productLimit > 0
            ? productLimit
            : organization.subscriptionPeriodEventsLimit || null;
        const used = organization.subscriptionPeriodEventsCount;

        return {
          selfHosted: false,
          organization: organization.name,
          state,
          statusLine: meta.statusLine?.text ?? meta.banner?.description ?? null,
          plan: {
            name: product?.name ?? null,
            free: organization.subscriptionProductId
              ? FREE_PRODUCT_IDS.includes(organization.subscriptionProductId)
              : false,
            price:
              typeof price?.priceAmount === 'number'
                ? price.priceAmount / CENTS_PER_UNIT
                : null,
            currency: price?.priceCurrency ?? null,
            interval:
              product?.recurringInterval ?? organization.subscriptionInterval,
            eventsLimit,
          },
          usage: {
            eventsThisPeriod: used,
            eventsLimit,
            percentUsed: eventsLimit
              ? Math.round((used / eventsLimit) * PERCENT)
              : null,
            periodStart: iso(organization.subscriptionStartsAt),
            periodEnd: iso(organization.subscriptionEndsAt),
            limitExceededAt: iso(
              organization.subscriptionPeriodEventsCountExceededAt
            ),
          },
          schedule: {
            canceledAt: iso(organization.subscriptionCanceledAt),
            pauseAtPeriodEnd: organization.subscriptionPauseAtPeriodEnd,
            resumesAt: iso(organization.subscriptionResumesAt),
          },
          billingUrl,
        };
      },
    }),

    list_plans: tool({
      description:
        'The plans the workspace can move to, with price, interval and event limit, and which one is current. Call before change_plan so the user can pick.',
      inputSchema: z.object({}),
      execute: async (): Promise<
        { plans: PlanOption[] } | { selfHosted: true; message: string }
      > => {
        if (ctx.config.selfHosted) {
          return {
            selfHosted: true,
            message: 'Self-hosted installs have no plans.',
          };
        }
        const [organization, products] = await Promise.all([
          deps.db.organization.findUniqueOrThrow({
            where: { id: organizationId },
            select: { subscriptionProductId: true },
          }),
          actions.subscription.products({ organizationId }),
        ]);
        return {
          plans: products.map((product) => {
            const price = (product.prices?.[0] ?? null) as
              | (PriceLike & { id?: string })
              | null;
            const limit = Number(product.metadata?.eventsLimit);
            return {
              productId: product.id,
              productPriceId: price?.id ?? null,
              name: product.name,
              eventsLimit: Number.isFinite(limit) && limit > 0 ? limit : null,
              price:
                typeof price?.priceAmount === 'number'
                  ? price.priceAmount / CENTS_PER_UNIT
                  : null,
              currency: price?.priceCurrency ?? null,
              interval: product.recurringInterval ?? null,
              current: product.id === organization.subscriptionProductId,
              unavailable: product.disabled ?? null,
            };
          }),
        };
      },
    }),

    change_plan: tool({
      description:
        'Move the workspace to another plan. Asks the user to confirm. With an active paid subscription the change applies right away (Polar prorates it); otherwise the result is a checkout link the user completes on Polar. Only workspace admins can do this. Use productId and productPriceId from list_plans.',
      inputSchema: z.object({
        productId: z.string(),
        productPriceId: z.string(),
      }),
      execute: async ({ productId, productPriceId }) => {
        if (ctx.config.selfHosted) {
          return { error: 'Self-hosted installs have no plans to change.' };
        }
        const result = await actions.subscription.checkout({
          organizationId,
          productId,
          productPriceId,
        });
        if (result?.url) {
          return { checkoutUrl: result.url, billingUrl };
        }
        return { changed: true, billingUrl };
      },
    }),
  };
}
