import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type SubscriptionState,
  getSubscriptionState,
  subscriptionBlocksDashboard,
} from './subscription-state';

const DAY = 1000 * 60 * 60 * 24;
const future = new Date(Date.now() + 30 * DAY);
const past = new Date(Date.now() - DAY);

type Case = {
  name: string;
  status: string | null;
  canceledAt: Date | null;
  endsAt: Date | null;
  expected: SubscriptionState;
};

describe('getSubscriptionState', () => {
  const original = process.env.SELF_HOSTED;
  // The function short-circuits when SELF_HOSTED==='true'; force it off so we
  // exercise the real billing logic regardless of the dev's local env.
  beforeEach(() => {
    delete process.env.SELF_HOSTED;
  });
  afterEach(() => {
    if (original === undefined) {
      delete process.env.SELF_HOSTED;
    } else {
      process.env.SELF_HOSTED = original;
    }
  });

  const cases: Case[] = [
    // No paid subscription (trial is our own concept, Polar status null)
    { name: 'null status, ends in future', status: null, canceledAt: null, endsAt: future, expected: 'trialing' },
    { name: 'null status, ended', status: null, canceledAt: null, endsAt: past, expected: 'trial_expired' },
    { name: 'null status, no end date', status: null, canceledAt: null, endsAt: null, expected: 'trial_expired' },
    { name: 'trialing status, ends in future', status: 'trialing', canceledAt: null, endsAt: future, expected: 'trialing' },
    { name: 'trialing status, ended', status: 'trialing', canceledAt: null, endsAt: past, expected: 'trial_expired' },

    // Active paid subscription
    { name: 'active, renewing', status: 'active', canceledAt: null, endsAt: future, expected: 'active' },
    { name: 'active, no end date', status: 'active', canceledAt: null, endsAt: null, expected: 'active' },
    { name: 'active but period already passed', status: 'active', canceledAt: null, endsAt: past, expected: 'expired' },

    // Cancel-at-period-end keeps status active while canceledAt is set
    { name: 'active + canceledAt (canceling)', status: 'active', canceledAt: past, endsAt: future, expected: 'canceling' },
    { name: 'canceledAt wins even if period passed', status: 'active', canceledAt: past, endsAt: past, expected: 'canceling' },

    // Payment-problem states
    { name: 'past_due', status: 'past_due', canceledAt: null, endsAt: future, expected: 'past_due' },
    { name: 'unpaid', status: 'unpaid', canceledAt: null, endsAt: future, expected: 'unpaid' },
    { name: 'incomplete', status: 'incomplete', canceledAt: null, endsAt: future, expected: 'incomplete' },
    { name: 'incomplete_expired', status: 'incomplete_expired', canceledAt: null, endsAt: past, expected: 'expired' },

    // Fully canceled / revoked
    { name: 'canceled', status: 'canceled', canceledAt: past, endsAt: past, expected: 'canceled' },

    // Unknown status falls back to expired (fail safe, never silently active)
    { name: 'unknown status', status: 'something_new', canceledAt: null, endsAt: future, expected: 'expired' },
  ];

  for (const c of cases) {
    it(`${c.name} -> ${c.expected}`, () => {
      expect(
        getSubscriptionState({
          subscriptionStatus: c.status,
          subscriptionCanceledAt: c.canceledAt,
          subscriptionEndsAt: c.endsAt,
        })
      ).toBe(c.expected);
    });
  }

  it('SELF_HOSTED=true short-circuits to self_hosted', () => {
    process.env.SELF_HOSTED = 'true';
    expect(
      getSubscriptionState({
        subscriptionStatus: 'canceled',
        subscriptionCanceledAt: past,
        subscriptionEndsAt: past,
      })
    ).toBe('self_hosted');
  });
});

describe('subscriptionBlocksDashboard', () => {
  const blocking: SubscriptionState[] = [
    'trial_expired',
    'expired',
    'unpaid',
    'canceled',
  ];
  const allowed: SubscriptionState[] = [
    'self_hosted',
    'trialing',
    'active',
    'canceling',
    'past_due',
    'incomplete',
  ];

  for (const state of blocking) {
    it(`blocks ${state}`, () => {
      expect(subscriptionBlocksDashboard(state)).toBe(true);
    });
  }
  for (const state of allowed) {
    it(`allows ${state}`, () => {
      expect(subscriptionBlocksDashboard(state)).toBe(false);
    });
  }
});
