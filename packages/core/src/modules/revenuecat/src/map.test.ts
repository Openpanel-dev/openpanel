import { describe, expect, test } from 'bun:test';
import {
  type IRevenueCatEvent,
  zRevenueCatWebhook,
} from '../revenuecat.constants';
import { credentialsFromAuthorization } from './auth';
import { mapRevenueCatEvent, revenueCatProfileId } from './map';

const AT = Date.UTC(2026, 10, 27, 8, 30);

function event(overrides: Partial<IRevenueCatEvent> = {}): IRevenueCatEvent {
  return {
    id: 'rc-event-1',
    type: 'INITIAL_PURCHASE',
    app_user_id: 'user-42',
    event_timestamp_ms: AT,
    product_id: 'pro_monthly',
    period_type: 'NORMAL',
    environment: 'PRODUCTION',
    store: 'APP_STORE',
    price: 9.99,
    currency: 'EUR',
    price_in_purchased_currency: 9.49,
    country_code: 'DE',
    entitlement_ids: ['pro', 'plus'],
    ...overrides,
  };
}

const names = (tracks: ReturnType<typeof mapRevenueCatEvent>) =>
  tracks.map((track) => track.name);

describe('RevenueCat event names follow the PostHog integration', () => {
  test.each([
    [{ type: 'INITIAL_PURCHASE' }, 'rc_initial_purchase_event'],
    [
      { type: 'INITIAL_PURCHASE', period_type: 'TRIAL', price: 0 },
      'rc_trial_started_event',
    ],
    [{ type: 'RENEWAL' }, 'rc_renewal_event'],
    [
      { type: 'RENEWAL', is_trial_conversion: true },
      'rc_trial_converted_event',
    ],
    [{ type: 'CANCELLATION', price: 0 }, 'rc_cancellation_event'],
    [
      { type: 'CANCELLATION', period_type: 'TRIAL', price: 0 },
      'rc_trial_cancelled_event',
    ],
    [{ type: 'UNCANCELLATION' }, 'rc_uncancellation_event'],
    [{ type: 'NON_RENEWING_PURCHASE' }, 'rc_non_subscription_purchase_event'],
    [{ type: 'SUBSCRIPTION_PAUSED' }, 'rc_subscription_paused_event'],
    [
      { type: 'EXPIRATION', expiration_reason: 'UNSUBSCRIBE' },
      'rc_expiration_event',
    ],
    [{ type: 'BILLING_ISSUE' }, 'rc_billing_issue_event'],
    [
      { type: 'PRODUCT_CHANGE', new_product_id: 'pro_yearly' },
      'rc_product_change_event',
    ],
  ] as const)('%o becomes %s', (overrides, name) => {
    expect(mapRevenueCatEvent(event(overrides))[0]?.name).toBe(name);
  });

  test.each([
    'TEST',
    'TRANSFER',
    'SUBSCRIPTION_EXTENDED',
    'SOMETHING_NEW',
  ])('records nothing for %s', (type) => {
    expect(mapRevenueCatEvent(event({ type }))).toEqual([]);
  });
});

describe('revenue', () => {
  test('a paid purchase in production adds a revenue event in US cents', () => {
    const tracks = mapRevenueCatEvent(event());
    expect(names(tracks)).toEqual(['rc_initial_purchase_event', 'revenue']);
    expect(tracks[1]?.properties).toMatchObject({
      __revenue: 999,
      currency: 'USD',
      product_id: 'pro_monthly',
      rc_event_id: 'rc-event-1',
    });
  });

  test('renewals and trial conversions count, a trial start does not', () => {
    expect(names(mapRevenueCatEvent(event({ type: 'RENEWAL' })))).toContain(
      'revenue'
    );
    expect(
      names(
        mapRevenueCatEvent(
          event({ type: 'RENEWAL', is_trial_conversion: true })
        )
      )
    ).toContain('revenue');
    expect(
      names(mapRevenueCatEvent(event({ period_type: 'TRIAL', price: 0 })))
    ).toEqual(['rc_trial_started_event']);
  });

  test('sandbox purchases are tracked without revenue', () => {
    expect(
      names(mapRevenueCatEvent(event({ environment: 'SANDBOX' })))
    ).toEqual(['rc_initial_purchase_event']);
  });

  test('a refund is a cancellation flagged as a refund, never negative revenue', () => {
    const tracks = mapRevenueCatEvent(
      event({
        type: 'CANCELLATION',
        price: -9.99,
        cancel_reason: 'CUSTOMER_SUPPORT',
      })
    );
    expect(names(tracks)).toEqual(['rc_cancellation_event']);
    expect(tracks[0]?.properties).toMatchObject({
      refund: true,
      revenue: -9.99,
      cancel_reason: 'CUSTOMER_SUPPORT',
    });
  });

  test('rounds to whole cents', () => {
    expect(
      mapRevenueCatEvent(event({ price: 4.995 }))[1]?.properties.__revenue
    ).toBe(500);
  });
});

describe('properties', () => {
  test('carry the time of the event, not of the delivery, and only set values', () => {
    const [track] = mapRevenueCatEvent(event());
    expect(track?.properties.__timestamp).toBe(new Date(AT).toISOString());
    expect(track?.properties).toMatchObject({
      revenue: 9.99,
      currency: 'EUR',
      price_in_purchased_currency: 9.49,
      entitlement_ids: 'pro,plus',
      environment: 'PRODUCTION',
      country_code: 'DE',
      rc_event_type: 'INITIAL_PURCHASE',
    });
    expect('cancel_reason' in (track?.properties ?? {})).toBe(false);
  });
});

describe('the user', () => {
  test('is the app user id', () => {
    expect(revenueCatProfileId(event())).toBe('user-42');
  });

  test('is the identified alias when RevenueCat still uses its anonymous id', () => {
    expect(
      revenueCatProfileId(
        event({
          app_user_id: '$RCAnonymousID:abc',
          original_app_user_id: '$RCAnonymousID:abc',
          aliases: ['$RCAnonymousID:abc', 'user-42'],
        })
      )
    ).toBe('user-42');
  });

  test('stays anonymous when nothing better is known', () => {
    expect(
      revenueCatProfileId(
        event({ app_user_id: '$RCAnonymousID:abc', aliases: [] })
      )
    ).toBe('$RCAnonymousID:abc');
  });
});

describe('the Authorization header', () => {
  const token = Buffer.from(
    '11111111-1111-4111-8111-111111111111:sec_abc'
  ).toString('base64');

  test.each([
    `Bearer ${token}`,
    `Basic ${token}`,
    `bearer ${token}`,
  ])('reads %s', (value) => {
    expect(credentialsFromAuthorization({ authorization: value })).toEqual({
      clientId: '11111111-1111-4111-8111-111111111111',
      clientSecret: 'sec_abc',
    });
  });

  test.each([
    undefined,
    '',
    token,
    'Bearer',
    `Bearer ${Buffer.from('no-secret:').toString('base64')}`,
    `Bearer ${Buffer.from(':no-id').toString('base64')}`,
  ])('refuses %s', (value) => {
    expect(credentialsFromAuthorization({ authorization: value })).toBeNull();
  });
});

describe('events RevenueCat sends without every field', () => {
  test('a transfer has no app_user_id and the webhook body still parses', () => {
    const body = zRevenueCatWebhook.parse({
      api_version: '1.0',
      event: {
        id: 'rc-transfer',
        type: 'TRANSFER',
        event_timestamp_ms: AT,
        transferred_from: ['$RCAnonymousID:a'],
        transferred_to: ['user-42'],
      },
    });
    expect(body.event.app_user_id).toBeUndefined();
    expect(mapRevenueCatEvent(body.event)).toEqual([]);
  });

  test('a recorded type without a user is skipped, not refused', () => {
    expect(mapRevenueCatEvent(event({ app_user_id: undefined }))).toEqual([]);
  });

  test('a field of an odd type reads as null instead of failing the body', () => {
    const body = zRevenueCatWebhook.parse({
      event: {
        ...event(),
        price: '9.99',
        aliases: 'user-42',
        renewal_number: 'two',
      },
    });
    expect(body.event.price).toBeNull();
    expect(body.event.aliases).toBeNull();
    expect(names(mapRevenueCatEvent(body.event))).toEqual([
      'rc_initial_purchase_event',
    ]);
  });

  test('an event without a time keeps the time it arrived', () => {
    const receivedAt = Date.UTC(2026, 10, 27, 9, 0);
    const [track] = mapRevenueCatEvent(
      event({ event_timestamp_ms: undefined }),
      receivedAt
    );
    expect(track?.properties.__timestamp).toBe(
      new Date(receivedAt).toISOString()
    );
  });

  test('only id and type are required', () => {
    expect(
      zRevenueCatWebhook.safeParse({ event: { type: 'TEST' } }).success
    ).toBe(false);
    expect(zRevenueCatWebhook.safeParse({ event: { id: 'x' } }).success).toBe(
      false
    );
    expect(
      zRevenueCatWebhook.safeParse({ event: { id: 'x', type: 'TEST' } }).success
    ).toBe(true);
  });
});
