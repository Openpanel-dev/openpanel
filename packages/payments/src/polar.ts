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

export async function cancelSubscription(subscriptionId: string) {
  try {
    return await polar.subscriptions.update({
      id: subscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
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
    },
  });
}
