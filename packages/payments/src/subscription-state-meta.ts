import { format } from 'date-fns';
import type { SubscriptionState } from './subscription-state.js';

type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'destructive';
type Tone = 'default' | 'warning' | 'destructive';

export type SubscriptionStateMeta = {
  /** Sidebar badge, or null when nothing should be shown. */
  badge: { label: string; variant: BadgeVariant } | null;
  /** App-level banner, or null when no banner should show for this state. */
  banner: {
    title: string;
    description: string;
    cta: string;
    tone: Tone;
  } | null;
  /** Inline status line on the billing page, or null. */
  statusLine: { text: string; tone: Tone } | null;
  /** BillingPrompt copy key when this state blocks the dashboard. */
  blockType: 'expired' | 'trialEnded' | 'unpaid' | null;
};

const fmt = (date: Date | null | undefined) =>
  date ? format(date, 'PPP') : null;

/**
 * Single source of truth for how every subscription state is presented across
 * the dashboard (billing page status line, app banner, sidebar badge, and the
 * blocking BillingPrompt). All lifecycle dates come from `subscriptionEndsAt`.
 */
export function getSubscriptionStateMeta(
  state: SubscriptionState,
  opts: { endsAt?: Date | null; canceledAt?: Date | null }
): SubscriptionStateMeta {
  const endsAt = fmt(opts.endsAt);
  const canceledAt = fmt(opts.canceledAt);

  switch (state) {
    case 'self_hosted':
    case 'active':
      return {
        badge: null,
        banner: null,
        statusLine: endsAt
          ? { text: `Your subscription renews on ${endsAt}`, tone: 'default' }
          : null,
        blockType: null,
      };

    case 'trialing':
      return {
        badge: { label: 'Trial', variant: 'secondary' },
        banner: {
          title: 'Free trial',
          description: endsAt
            ? `Your organization is on a free trial. It ends on ${endsAt}.`
            : 'Your organization is on a free trial.',
          cta: 'Upgrade from $2.5/month',
          tone: 'default',
        },
        statusLine: endsAt
          ? { text: `Your trial ends on ${endsAt}`, tone: 'default' }
          : null,
        blockType: null,
      };

    case 'trial_expired':
      return {
        badge: { label: 'Trial ended', variant: 'destructive' },
        banner: {
          title: 'Trial ended',
          description:
            'Your free trial has ended. Upgrade to keep using OpenPanel.',
          cta: 'Upgrade',
          tone: 'destructive',
        },
        statusLine: { text: 'Your free trial has ended.', tone: 'destructive' },
        blockType: 'trialEnded',
      };

    case 'canceling':
      return {
        badge: { label: 'Canceling', variant: 'warning' },
        banner: {
          title: 'Subscription will be canceled',
          description: endsAt
            ? `You have canceled your subscription. It will be canceled on ${endsAt} — reactivate it to keep your access.`
            : 'You have canceled your subscription. Reactivate it to keep your access.',
          cta: 'Reactivate',
          tone: 'warning',
        },
        statusLine: endsAt
          ? {
              text: `Your subscription will be canceled on ${endsAt}`,
              tone: 'destructive',
            }
          : null,
        blockType: null,
      };

    case 'canceled':
      return {
        badge: { label: 'Canceled', variant: 'destructive' },
        banner: {
          title: 'Subscription canceled',
          description: canceledAt
            ? `Your subscription was canceled on ${canceledAt}. Choose a plan to regain access.`
            : 'Your subscription was canceled. Choose a plan to regain access.',
          cta: 'Choose a plan',
          tone: 'destructive',
        },
        statusLine: {
          text: canceledAt
            ? `Your subscription was canceled on ${canceledAt}`
            : 'Your subscription was canceled',
          tone: 'destructive',
        },
        blockType: 'expired',
      };

    case 'past_due':
      return {
        badge: { label: 'Past due', variant: 'warning' },
        banner: {
          title: 'Payment past due',
          description:
            'Your last payment failed. Update your payment method to avoid losing access.',
          cta: 'Update payment',
          tone: 'warning',
        },
        statusLine: {
          text: 'Your last payment failed — please update your payment method.',
          tone: 'destructive',
        },
        blockType: null,
      };

    case 'unpaid':
      return {
        badge: { label: 'Unpaid', variant: 'destructive' },
        banner: {
          title: 'Subscription unpaid',
          description:
            'Your subscription is unpaid. Update your payment method to restore access.',
          cta: 'Update payment',
          tone: 'destructive',
        },
        statusLine: {
          text: 'Your subscription is unpaid.',
          tone: 'destructive',
        },
        blockType: 'unpaid',
      };

    case 'incomplete':
      return {
        badge: { label: 'Incomplete', variant: 'warning' },
        banner: {
          title: 'Finish setting up your subscription',
          description:
            'Your subscription setup is incomplete. Complete checkout to activate it.',
          cta: 'Complete checkout',
          tone: 'warning',
        },
        statusLine: {
          text: 'Your subscription setup is incomplete.',
          tone: 'destructive',
        },
        blockType: null,
      };

    case 'expired':
      return {
        badge: { label: 'Expired', variant: 'destructive' },
        banner: {
          title: 'Subscription expired',
          description: endsAt
            ? `Your subscription expired on ${endsAt}. Choose a plan to regain access.`
            : 'Your subscription expired. Choose a plan to regain access.',
          cta: 'Choose a plan',
          tone: 'destructive',
        },
        statusLine: {
          text: endsAt
            ? `Your subscription expired on ${endsAt}`
            : 'Your subscription expired',
          tone: 'destructive',
        },
        blockType: 'expired',
      };

    default: {
      // Exhaustiveness guard — every SubscriptionState must be handled above.
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
