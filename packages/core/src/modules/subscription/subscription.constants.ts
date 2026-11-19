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
