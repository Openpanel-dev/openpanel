/**
 * Canonical subscription state for an organization. This is the single place
 * the raw Polar status + cancellation/period fields are interpreted; every
 * boolean flag and UI surface derives from it.
 *
 * Pure, dependency-free domain logic so both the database layer (Prisma
 * computed fields) and the browser dashboard can consume it without coupling
 * to either side.
 */
export type SubscriptionState =
  | 'self_hosted' // SELF_HOSTED=true — billing not applicable
  | 'trialing' // in the trial window, no paid subscription yet
  | 'trial_expired' // trial window passed, no paid subscription
  | 'active' // paid, renewing
  | 'canceling' // active but scheduled to cancel at period end
  | 'canceled' // fully canceled / revoked (access ended)
  | 'pausing' // active but scheduled to pause at period end
  | 'paused' // paused — billing stopped, data still collected
  | 'past_due' // payment failed, in dunning (still has access)
  | 'unpaid' // payment failed terminally
  | 'incomplete' // initial checkout not completed
  | 'expired'; // period ended without renewal (catch-all)

export interface SubscriptionStateInput {
  subscriptionStatus: string | null;
  subscriptionCanceledAt: Date | null;
  subscriptionEndsAt: Date | null;
  subscriptionPauseAtPeriodEnd: boolean;
}

export function getSubscriptionState(
  org: SubscriptionStateInput
): SubscriptionState {
  if (process.env.SELF_HOSTED === 'true') {
    return 'self_hosted';
  }

  const now = new Date();
  const {
    subscriptionStatus,
    subscriptionCanceledAt,
    subscriptionEndsAt,
    subscriptionPauseAtPeriodEnd,
  } = org;
  const endsInFuture = Boolean(subscriptionEndsAt && subscriptionEndsAt > now);

  switch (subscriptionStatus) {
    case null:
    case 'trialing':
      return endsInFuture ? 'trialing' : 'trial_expired';
    case 'active':
      // Cancel-at-period-end keeps the Polar status as `active` while
      // `canceledAt` is set; the subscription stays usable until it expires.
      // Cancellation wins over a scheduled pause — Polar clears the pause flag
      // on cancel, but a stale combination must not hide that it's ending.
      if (subscriptionCanceledAt) {
        return 'canceling';
      }
      // Pause-at-period-end works the same way: status stays `active` with the
      // flag set until the period ends, then Polar flips it to `paused`.
      if (subscriptionPauseAtPeriodEnd) {
        return 'pausing';
      }
      return subscriptionEndsAt && subscriptionEndsAt <= now
        ? 'expired'
        : 'active';
    case 'paused':
      return 'paused';
    case 'past_due':
      return 'past_due';
    case 'unpaid':
      return 'unpaid';
    case 'incomplete':
      return 'incomplete';
    case 'incomplete_expired':
      return 'expired';
    case 'canceled':
      return 'canceled';
    default:
      return 'expired';
  }
}

/**
 * Whether a given state should block access to the dashboard (and force the
 * billing prompt). Payment-in-progress states keep access; terminal/expired
 * states do not.
 */
export function subscriptionBlocksDashboard(state: SubscriptionState): boolean {
  switch (state) {
    case 'trial_expired':
    case 'expired':
    case 'unpaid':
    case 'canceled':
    // Paused blocks the dashboard too (billing has stopped), but with its own
    // prompt: data is still collected and one click resumes the subscription.
    case 'paused':
      return true;
    default:
      return false;
  }
}
