import {
  type IRevenueCatEvent,
  REVENUECAT_EVENT_NAMES as NAMES,
} from '../revenuecat.constants';

export interface RevenueCatTrack {
  name: string;
  profileId: string;
  properties: Record<string, string | number | boolean>;
}

const ANONYMOUS_PREFIX = '$RCAnonymousID:';
const CENTS_PER_DOLLAR = 100;

/** The event name, or null for a type OpenPanel does not record. */
function eventName(event: IRevenueCatEvent): string | null {
  const isTrial = event.period_type === 'TRIAL';
  switch (event.type) {
    case 'INITIAL_PURCHASE':
      return isTrial ? NAMES.trialStarted : NAMES.initialPurchase;
    case 'RENEWAL':
      return event.is_trial_conversion ? NAMES.trialConverted : NAMES.renewal;
    case 'CANCELLATION':
      return isTrial ? NAMES.trialCancelled : NAMES.cancellation;
    case 'UNCANCELLATION':
      return NAMES.uncancellation;
    case 'NON_RENEWING_PURCHASE':
      return NAMES.nonSubscriptionPurchase;
    case 'SUBSCRIPTION_PAUSED':
      return NAMES.subscriptionPaused;
    case 'EXPIRATION':
      return NAMES.expiration;
    case 'BILLING_ISSUE':
      return NAMES.billingIssue;
    case 'PRODUCT_CHANGE':
      return NAMES.productChange;
    default:
      return null;
  }
}

const COUNTS_AS_REVENUE = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'NON_RENEWING_PURCHASE',
]);

/**
 * The user the app identified. RevenueCat starts with an anonymous id and
 * lists the app's own id among the aliases once the app logs the user in.
 */
export function revenueCatProfileId(event: IRevenueCatEvent): string {
  if (!event.app_user_id.startsWith(ANONYMOUS_PREFIX)) {
    return event.app_user_id;
  }
  const known = [event.original_app_user_id, ...(event.aliases ?? [])].find(
    (id): id is string => Boolean(id) && !id?.startsWith(ANONYMOUS_PREFIX)
  );
  return known ?? event.app_user_id;
}

function compact(
  values: Record<string, string | number | boolean | null | undefined>
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== null && entry[1] !== undefined && entry[1] !== ''
    )
  );
}

const isoOrNull = (ms: number | null | undefined) =>
  typeof ms === 'number' ? new Date(ms).toISOString() : null;

/**
 * One RevenueCat event as the tracks OpenPanel records: the `rc_*` event and,
 * for a paid purchase in production, a `revenue` event in US cents. A refund
 * comes as a cancellation with a negative price; revenue cannot go below
 * zero, so it is flagged on the cancellation instead.
 */
export function mapRevenueCatEvent(event: IRevenueCatEvent): RevenueCatTrack[] {
  const name = eventName(event);
  if (!name) {
    return [];
  }
  const profileId = revenueCatProfileId(event);
  const timestamp = new Date(event.event_timestamp_ms).toISOString();
  const price = event.price ?? null;
  const tracks: RevenueCatTrack[] = [
    {
      name,
      profileId,
      properties: compact({
        __timestamp: timestamp,
        revenue: price,
        currency: event.currency,
        price_in_purchased_currency: event.price_in_purchased_currency,
        product_id: event.product_id,
        new_product_id: event.new_product_id,
        period_type: event.period_type,
        purchased_at: isoOrNull(event.purchased_at_ms),
        expiration_at: isoOrNull(event.expiration_at_ms),
        entitlement_ids: event.entitlement_ids?.join(','),
        presented_offering_id: event.presented_offering_id,
        transaction_id: event.transaction_id,
        original_transaction_id: event.original_transaction_id,
        store: event.store,
        environment: event.environment,
        country_code: event.country_code,
        cancel_reason: event.cancel_reason,
        expiration_reason: event.expiration_reason,
        renewal_number: event.renewal_number,
        refund: price !== null && price < 0 ? true : null,
        app_user_id: event.app_user_id,
        original_app_user_id: event.original_app_user_id,
        rc_event_id: event.id,
        rc_event_type: event.type,
      }),
    },
  ];

  const paid =
    COUNTS_AS_REVENUE.has(event.type) &&
    event.environment === 'PRODUCTION' &&
    price !== null &&
    price > 0;
  if (paid) {
    tracks.push({
      name: 'revenue',
      profileId,
      properties: compact({
        __timestamp: timestamp,
        __revenue: Math.round(price * CENTS_PER_DOLLAR),
        currency: 'USD',
        product_id: event.product_id,
        store: event.store,
        rc_event_id: event.id,
        rc_event_type: event.type,
      }),
    });
  }
  return tracks;
}
