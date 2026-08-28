/**
 * Retire the 'onboarding-trial-ended' pointer.
 *
 * The onboarding drip used to end with a day-30 'onboarding-trial-ended'
 * email. That moment now belongs to the wind-down sequence (step 0,
 * 'wind-down-expired'), which is anchored on trial expiry rather than signup,
 * so the step was removed from ONBOARDING_EMAILS.
 *
 * Organizations whose `onboarding` column still holds the removed name are
 * left pointing at a step that no longer exists. The sequence runner treats an
 * unknown pointer as "sequence complete" precisely so this cannot replay the
 * drip from the welcome email — but it does so one organization at a time,
 * emitting a warning for each. Settling them here keeps that path for genuine
 * accidents rather than for a rename we already know about.
 *
 *   pnpm with-env jiti ./code-migrations/21-wind-down-onboarding-pointer.ts --dry
 */
import { db } from '../src/prisma-client';
import { getIsDry, printBoxMessage } from './helpers';

const RETIRED_POINTER = 'onboarding-trial-ended';

export async function up() {
  const isDry = getIsDry();

  const stranded = await db.organization.count({
    where: { onboarding: RETIRED_POINTER },
  });

  printBoxMessage('📋 Plan', [
    `Organizations pointing at "${RETIRED_POINTER}": ${stranded}`,
    'They will be marked as onboarding: "completed"',
  ]);

  if (stranded === 0) {
    printBoxMessage('✅ Nothing to do', [
      'No organization holds the retired pointer',
    ]);
    return;
  }

  if (isDry) {
    printBoxMessage('🕒 Dry run - nothing written', [
      `Would update ${stranded} organization(s)`,
    ]);
    return;
  }

  const { count } = await db.organization.updateMany({
    where: { onboarding: RETIRED_POINTER },
    data: { onboarding: 'completed' },
  });

  printBoxMessage('✅ Done', [`Updated ${count} organization(s)`]);
}
