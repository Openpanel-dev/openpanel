import { z } from 'zod';

/**
 * The fields of a RevenueCat webhook event that OpenPanel reads. Only `id` and
 * `type` are on every event: a transfer has no `app_user_id`, for one. A field
 * that is missing or of an odd type reads as null, because RevenueCat retries
 * anything but a 200 and the event would never get through.
 */
export const zRevenueCatEvent = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    app_user_id: z.string().min(1).nullish().catch(null),
    original_app_user_id: z.string().nullish().catch(null),
    aliases: z.array(z.string()).nullish().catch(null),
    event_timestamp_ms: z.number().nullish().catch(null),
    product_id: z.string().nullish().catch(null),
    period_type: z.string().nullish().catch(null),
    purchased_at_ms: z.number().nullish().catch(null),
    expiration_at_ms: z.number().nullish().catch(null),
    environment: z.string().nullish().catch(null),
    store: z.string().nullish().catch(null),
    price: z.number().nullish().catch(null),
    price_in_purchased_currency: z.number().nullish().catch(null),
    currency: z.string().nullish().catch(null),
    country_code: z.string().nullish().catch(null),
    transaction_id: z.string().nullish().catch(null),
    original_transaction_id: z.string().nullish().catch(null),
    is_trial_conversion: z.boolean().nullish().catch(null),
    cancel_reason: z.string().nullish().catch(null),
    expiration_reason: z.string().nullish().catch(null),
    renewal_number: z.number().nullish().catch(null),
    entitlement_ids: z.array(z.string()).nullish().catch(null),
    presented_offering_id: z.string().nullish().catch(null),
    new_product_id: z.string().nullish().catch(null),
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
