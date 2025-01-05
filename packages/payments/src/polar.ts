// src/polar.ts
import { Polar } from '@polar-sh/sdk';
export {
  validateEvent as validatePolarEvent,
  WebhookVerificationError as PolarWebhookVerificationError,
} from '@polar-sh/sdk/webhooks';

export type { ProductPrice } from '@polar-sh/sdk/models/components';

export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: 'sandbox', // Use this option if you're using the sandbox environment - else use 'production' or omit the parameter
});
