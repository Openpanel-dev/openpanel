// src/polar.ts
import { Polar } from '@polar-sh/sdk';
export {
  validateEvent as validatePolarEvent,
  WebhookVerificationError as PolarWebhookVerificationError,
} from '@polar-sh/sdk/webhooks';

export type IPolarProduct = Awaited<ReturnType<typeof getProduct>>;
export type IPolarPrice = IPolarProduct['prices'][number];

export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
});

export const getSuccessUrl = (baseUrl: string, organizationId: string) =>
  `${baseUrl}/${organizationId}/billing`;

export async function getProducts() {
  const products = await polar.products.list({
    limit: 100,
    isArchived: false,
    sorting: ['price_amount'],
  });
  return products.result.items.filter((product) => {
    return (
      product.metadata.custom !== 'true' && product.metadata.custom !== true
    );
  });
}

export async function getProduct(id: string) {
  return polar.products.get({ id });
}

export async function createPortal({
  customerId,
}: {
  customerId: string;
}) {
  return polar.customerSessions.create({
    customerId,
  });
}

export async function createCheckout({
  productId,
  organizationId,
  user,
  ipAddress,
}: {
  productId: string;
  organizationId: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  ipAddress: string;
}) {
  return polar.checkouts.create({
    // productPriceId: priceId,
    products: [productId],
    successUrl: getSuccessUrl(
      process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL!,
      organizationId,
    ),
    customerEmail: user.email,
    customerName: [user.firstName, user.lastName].filter(Boolean).join(' '),
    customerIpAddress: ipAddress,
    metadata: {
      organizationId,
      userId: user.id,
    },
  });
}

export type ICancellationReason =
  | 'too_expensive'
  | 'missing_features'
  | 'switched_service'
  | 'unused'
  | 'customer_service'
  | 'low_quality'
  | 'too_complex'
  | 'other';

export async function cancelSubscription(
  subscriptionId: string,
  cancellation?: {
    reason?: ICancellationReason;
    comment?: string;
  }
) {
  try {
    return await polar.subscriptions.update({
      id: subscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
        customerCancellationReason: cancellation?.reason ?? null,
        customerCancellationComment: cancellation?.comment ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      // Don't throw an error if the subscription is already canceled
      if (error.name === 'AlreadyCanceledSubscription') {
        return polar.subscriptions.get({ id: subscriptionId });
      }
    }

    throw error;
  }
}

/**
 * Pause an active subscription at the end of the current period. Billing stops
 * but the subscription (and its payment method) is kept, so the customer can
 * come back without a new checkout. `resumesAt` must be after the current
 * period end; omitted means paused until manually resumed.
 */
export function pauseSubscription(subscriptionId: string, resumesAt?: Date) {
  return polar.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: {
      pauseAtPeriodEnd: true,
      resumesAt: resumesAt ?? null,
    },
  });
}

/** Cancel a scheduled pause while the subscription is still active. */
export function unpauseSubscription(subscriptionId: string) {
  return polar.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: {
      pauseAtPeriodEnd: false,
    },
  });
}

/**
 * Resume an already-paused subscription immediately — starts a new billing
 * period and charges the customer.
 */
export function resumeSubscription(subscriptionId: string) {
  return polar.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: {
      resume: true,
    },
  });
}

/**
 * Attach a discount to an active subscription. Polar applies it starting with
 * the next billing cycle.
 */
export function applySubscriptionDiscount(
  subscriptionId: string,
  discountId: string
) {
  return polar.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: {
      discountId,
    },
  });
}

export function reactivateSubscription(subscriptionId: string) {
  return polar.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: {
      cancelAtPeriodEnd: false,
    },
  });
}

export function changeSubscription(subscriptionId: string, productId: string) {
  return polar.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: {
      productId,
      prorationBehavior: 'invoice',
    },
  });
}
