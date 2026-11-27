import { z } from 'zod';

/**
 * The fields of a RevenueCat webhook event that OpenPanel reads. RevenueCat
 * adds fields over time, so everything else passes through untouched.
 */
export const zRevenueCatEvent = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    app_user_id: z.string().min(1),
    original_app_user_id: z.string().nullish(),
    aliases: z.array(z.string()).nullish(),
    event_timestamp_ms: z.number(),
    product_id: z.string().nullish(),
    period_type: z.string().nullish(),
    purchased_at_ms: z.number().nullish(),
    expiration_at_ms: z.number().nullish(),
    environment: z.string().nullish(),
    store: z.string().nullish(),
    price: z.number().nullish(),
    price_in_purchased_currency: z.number().nullish(),
    currency: z.string().nullish(),
    country_code: z.string().nullish(),
    transaction_id: z.string().nullish(),
    original_transaction_id: z.string().nullish(),
    is_trial_conversion: z.boolean().nullish(),
    cancel_reason: z.string().nullish(),
    expiration_reason: z.string().nullish(),
    renewal_number: z.number().nullish(),
    entitlement_ids: z.array(z.string()).nullish(),
    presented_offering_id: z.string().nullish(),
    new_product_id: z.string().nullish(),
  })
  .passthrough();

export const zRevenueCatWebhook = z
  .object({
    api_version: z.string().optional(),
    event: zRevenueCatEvent,
  })
  .passthrough();

export type IRevenueCatEvent = z.infer<typeof zRevenueCatEvent>;
export type IRevenueCatWebhook = z.infer<typeof zRevenueCatWebhook>;

/** The names RevenueCat's own PostHog integration sends, so charts built on them keep working. */
export const REVENUECAT_EVENT_NAMES = {
  initialPurchase: 'rc_initial_purchase_event',
  trialStarted: 'rc_trial_started_event',
  trialConverted: 'rc_trial_converted_event',
  trialCancelled: 'rc_trial_cancelled_event',
  renewal: 'rc_renewal_event',
  cancellation: 'rc_cancellation_event',
  uncancellation: 'rc_uncancellation_event',
  nonSubscriptionPurchase: 'rc_non_subscription_purchase_event',
  subscriptionPaused: 'rc_subscription_paused_event',
  expiration: 'rc_expiration_event',
  billingIssue: 'rc_billing_issue_event',
  productChange: 'rc_product_change_event',
} as const;

/** How long a delivered event id is remembered. RevenueCat retries for about 80 minutes. */
export const REVENUECAT_DEDUPE_SECONDS = 60 * 60 * 24 * 7;
