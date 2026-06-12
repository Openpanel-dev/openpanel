/**
 * Dev helper: force an organization into any subscription state so you can
 * eyeball every billing scenario in the dashboard.
 *
 *   pnpm dotenv -e .env -- tsx packages/db/scripts/set-subscription-state.ts <state> [orgId]
 *
 * <state> is one of the SubscriptionState values (except self_hosted, which is
 * env-driven). [orgId] defaults to "openpanel-dev".
 *
 * Note: the dashboard must run with SELF_HOSTED=false (or unset) to render
 * billing — with SELF_HOSTED=true every org resolves to `self_hosted`.
 */
import { getSubscriptionState } from '@openpanel/payments/subscription-state';
import { db } from '../src/prisma-client';

const DAY = 1000 * 60 * 60 * 24;
const future = () => new Date(Date.now() + 30 * DAY);
const past = () => new Date(Date.now() - DAY);
const monthAgo = () => new Date(Date.now() - 30 * DAY);

type Recipe = {
  subscriptionStatus: string | null;
  subscriptionCanceledAt: Date | null;
  subscriptionStartsAt: Date | null;
  subscriptionEndsAt: Date | null;
};

const recipes: Record<string, () => Recipe> = {
  trialing: () => ({
    subscriptionStatus: null,
    subscriptionCanceledAt: null,
    subscriptionStartsAt: null,
    subscriptionEndsAt: future(),
  }),
  trial_expired: () => ({
    subscriptionStatus: null,
    subscriptionCanceledAt: null,
    subscriptionStartsAt: null,
    subscriptionEndsAt: past(),
  }),
  active: () => ({
    subscriptionStatus: 'active',
    subscriptionCanceledAt: null,
    subscriptionStartsAt: new Date(),
    subscriptionEndsAt: future(),
  }),
  canceling: () => ({
    subscriptionStatus: 'active',
    subscriptionCanceledAt: new Date(),
    subscriptionStartsAt: new Date(),
    subscriptionEndsAt: future(),
  }),
  canceled: () => ({
    subscriptionStatus: 'canceled',
    subscriptionCanceledAt: past(),
    subscriptionStartsAt: monthAgo(),
    subscriptionEndsAt: past(),
  }),
  past_due: () => ({
    subscriptionStatus: 'past_due',
    subscriptionCanceledAt: null,
    subscriptionStartsAt: monthAgo(),
    subscriptionEndsAt: future(),
  }),
  unpaid: () => ({
    subscriptionStatus: 'unpaid',
    subscriptionCanceledAt: null,
    subscriptionStartsAt: monthAgo(),
    subscriptionEndsAt: future(),
  }),
  incomplete: () => ({
    subscriptionStatus: 'incomplete',
    subscriptionCanceledAt: null,
    subscriptionStartsAt: new Date(),
    subscriptionEndsAt: future(),
  }),
  expired: () => ({
    subscriptionStatus: 'active',
    subscriptionCanceledAt: null,
    subscriptionStartsAt: monthAgo(),
    subscriptionEndsAt: past(),
  }),
};

async function main() {
  const state = process.argv[2];
  const orgId = process.argv[3] ?? 'openpanel-dev';

  if (!state || !recipes[state]) {
    console.error(
      `Usage: set-subscription-state <state> [orgId]\n\nStates: ${Object.keys(recipes).join(', ')}`
    );
    process.exitCode = 1;
    return;
  }

  const recipe = recipes[state]();
  await db.organization.update({ where: { id: orgId }, data: recipe });

  // Compute the resolved state ignoring SELF_HOSTED so the printout reflects
  // what the dashboard shows when billing is enabled.
  delete process.env.SELF_HOSTED;
  const resolved = getSubscriptionState(recipe);

  console.log(`Set ${orgId} -> requested "${state}", resolves to "${resolved}"`);
  console.table({
    subscriptionStatus: recipe.subscriptionStatus,
    subscriptionCanceledAt: recipe.subscriptionCanceledAt?.toISOString() ?? null,
    subscriptionStartsAt: recipe.subscriptionStartsAt?.toISOString() ?? null,
    subscriptionEndsAt: recipe.subscriptionEndsAt?.toISOString() ?? null,
  });
  if (resolved !== state) {
    console.warn(
      `Heads up: resolves to "${resolved}", not "${state}" (status + dates combination).`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
