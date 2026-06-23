import type { SubscriptionState } from '@openpanel/payments/subscription-state';

type TranslationResult = {
  key: string;
  values?: Record<string, string | number | null>;
};

type SubscriptionDates = {
  endsAt: string | null;
  canceledAt: string | null;
};

export function getSubscriptionBadgeLabel(
  state: SubscriptionState,
): TranslationResult | null {
  switch (state) {
    case 'trialing':
      return { key: 'billing.badge_trial' };
    case 'trial_expired':
      return { key: 'billing.badge_trial_ended' };
    case 'canceling':
      return { key: 'billing.badge_canceling' };
    case 'canceled':
      return { key: 'billing.badge_canceled' };
    case 'past_due':
      return { key: 'billing.badge_past_due' };
    case 'unpaid':
      return { key: 'billing.badge_unpaid' };
    case 'incomplete':
      return { key: 'billing.badge_incomplete' };
    case 'expired':
      return { key: 'billing.badge_expired' };
    case 'self_hosted':
    case 'active':
      return null;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function getSubscriptionBannerCopy(
  state: SubscriptionState,
  { endsAt, canceledAt }: SubscriptionDates,
): { title: TranslationResult; description: TranslationResult; cta: TranslationResult } | null {
  switch (state) {
    case 'trialing':
      return {
        title: { key: 'billing.banner_trial_title' },
        description: endsAt
          ? {
              key: 'billing.banner_trial_description_with_date',
              values: { date: endsAt },
            }
          : { key: 'billing.banner_trial_description' },
        cta: { key: 'billing.banner_trial_cta' },
      };
    case 'trial_expired':
      return {
        title: { key: 'billing.banner_trial_ended_title' },
        description: { key: 'billing.banner_trial_ended_description' },
        cta: { key: 'billing.banner_upgrade_cta' },
      };
    case 'canceling':
      return {
        title: { key: 'billing.banner_canceling_title' },
        description: endsAt
          ? {
              key: 'billing.banner_canceling_description_with_date',
              values: { date: endsAt },
            }
          : { key: 'billing.banner_canceling_description' },
        cta: { key: 'billing.banner_reactivate_cta' },
      };
    case 'canceled':
      return {
        title: { key: 'billing.banner_canceled_title' },
        description: canceledAt
          ? {
              key: 'billing.banner_canceled_description_with_date',
              values: { date: canceledAt },
            }
          : { key: 'billing.banner_canceled_description' },
        cta: { key: 'billing.choose_plan_title' },
      };
    case 'past_due':
      return {
        title: { key: 'billing.banner_past_due_title' },
        description: { key: 'billing.banner_past_due_description' },
        cta: { key: 'billing.banner_update_payment_cta' },
      };
    case 'unpaid':
      return {
        title: { key: 'billing.banner_unpaid_title' },
        description: { key: 'billing.banner_unpaid_description' },
        cta: { key: 'billing.banner_update_payment_cta' },
      };
    case 'incomplete':
      return {
        title: { key: 'billing.banner_incomplete_title' },
        description: { key: 'billing.banner_incomplete_description' },
        cta: { key: 'billing.banner_complete_checkout_cta' },
      };
    case 'expired':
      return {
        title: { key: 'billing.banner_expired_title' },
        description: endsAt
          ? {
              key: 'billing.banner_expired_description_with_date',
              values: { date: endsAt },
            }
          : { key: 'billing.banner_expired_description' },
        cta: { key: 'billing.choose_plan_title' },
      };
    case 'self_hosted':
    case 'active':
      return null;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function getSubscriptionStatusLine(
  state: SubscriptionState,
  { endsAt, canceledAt }: SubscriptionDates,
): TranslationResult | null {
  switch (state) {
    case 'self_hosted':
    case 'active':
      return endsAt
        ? {
            key: 'billing.status_subscription_renews_on',
            values: { date: endsAt },
          }
        : null;
    case 'trialing':
      return endsAt
        ? {
            key: 'billing.status_trial_ends_on',
            values: { date: endsAt },
          }
        : null;
    case 'trial_expired':
      return { key: 'billing.status_trial_ended' };
    case 'canceling':
      return endsAt
        ? {
            key: 'billing.status_subscription_will_cancel_on',
            values: { date: endsAt },
          }
        : null;
    case 'canceled':
      return canceledAt
        ? {
            key: 'billing.status_subscription_canceled_on',
            values: { date: canceledAt },
          }
        : { key: 'billing.status_subscription_canceled' };
    case 'past_due':
      return { key: 'billing.status_payment_failed' };
    case 'unpaid':
      return { key: 'billing.status_subscription_unpaid' };
    case 'incomplete':
      return { key: 'billing.status_subscription_incomplete' };
    case 'expired':
      return endsAt
        ? {
            key: 'billing.status_subscription_expired_on',
            values: { date: endsAt },
          }
        : { key: 'billing.status_subscription_expired' };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
