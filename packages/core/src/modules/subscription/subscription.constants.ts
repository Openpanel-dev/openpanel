// Ported from V1's packages/validation/src/index.ts (ADR-008's module map:
// subscription owns "C") — that package doesn't exist in this tree;
// apps/start's billing forms and this module's own subscription.rpc.ts resolve
// these symbols through this file directly.
//
// Isomorphic by the AGENTS.md rule: zod and nothing else.

import { z } from 'zod';

export const zCheckout = z.object({
  productPriceId: z.string(),
  organizationId: z.string(),
  projectId: z.string().nullish(),
  productId: z.string(),
});
export type ICheckout = z.infer<typeof zCheckout>;

// Mirrors Polar's CustomerCancellationReason enum.
export const zCancellationReason = z.enum([
  'too_expensive',
  'missing_features',
  'switched_service',
  'unused',
  'customer_service',
  'low_quality',
  'too_complex',
  'other',
]);
export type ICancellationReason = z.infer<typeof zCancellationReason>;

export const zCancelSubscription = z.object({
  organizationId: z.string(),
  reason: zCancellationReason,
  comment: z.string().trim().max(1000).optional(),
});
export type ICancelSubscription = z.infer<typeof zCancelSubscription>;

export const zPauseSubscription = z.object({
  organizationId: z.string(),
  // Months after the current period end before billing automatically resumes.
  months: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export type IPauseSubscription = z.infer<typeof zPauseSubscription>;
