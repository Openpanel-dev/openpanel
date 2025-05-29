// src/polar.ts
let Polar: any;
let validateEvent: any;
let WebhookVerificationError: any;

try {
  const polarSdk = require('@polar-sh/sdk');
  Polar = polarSdk.Polar;
  const webhooks = require('@polar-sh/sdk/webhooks');
  validateEvent = webhooks.validateEvent;
  WebhookVerificationError = webhooks.WebhookVerificationError;
} catch (error) {
  console.warn('Polar SDK not available, payments functionality will be disabled');
  Polar = class MockPolar {
    constructor() {
      throw new Error('Polar SDK not available');
    }
  };
  validateEvent = () => { throw new Error('Polar SDK not available'); };
  WebhookVerificationError = Error;
}

export {
  validateEvent as validatePolarEvent,
  WebhookVerificationError as PolarWebhookVerificationError,
};

export type IPolarProduct = any;
export type IPolarPrice = any;

export const polar = process.env.POLAR_ACCESS_TOKEN ? new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
}) : null;

export const getSuccessUrl = (
  baseUrl: string,
  organizationId: string,
  projectId?: string,
) =>
  projectId
    ? `${baseUrl}/${organizationId}/${projectId}/settings?tab=billing`
    : `${baseUrl}/${organizationId}`;

export async function getProducts() {
  if (!polar) throw new Error('Polar not configured');
  const products = await polar.products.list({
    limit: 100,
    isArchived: false,
    sorting: ['price_amount'],
  });
  return products.result.items.filter((product: any) => {
    return (
      product.metadata.custom !== 'true' && product.metadata.custom !== true
    );
  });
}

export async function getProduct(id: string) {
  if (!polar) throw new Error('Polar not configured');
  return polar.products.get({ id });
}

export async function createPortal({
  customerId,
}: {
  customerId: string;
}) {
  if (!polar) throw new Error('Polar not configured');
  return polar.customerSessions.create({
    customerId,
  });
}

export async function createCheckout({
  priceId,
  organizationId,
  projectId,
  user,
  ipAddress,
}: {
  priceId: string;
  organizationId: string;
  projectId?: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  ipAddress: string;
}) {
  if (!polar) throw new Error('Polar not configured');
  return polar.checkouts.create({
    productPriceId: priceId,
    successUrl: getSuccessUrl(
      process.env.NEXT_PUBLIC_DASHBOARD_URL!,
      organizationId,
      projectId,
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
  if (!polar) throw new Error('Polar not configured');
  try {
    return await polar.subscriptions.update({
      id: subscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
        revoke: null,
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
  if (!polar) throw new Error('Polar not configured');
  return polar.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: {
      cancelAtPeriodEnd: false,
      revoke: null,
    },
  });
}

export function changeSubscription(subscriptionId: string, productId: string) {
  if (!polar) throw new Error('Polar not configured');
  return polar.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: {
      productId,
    },
  });
}
