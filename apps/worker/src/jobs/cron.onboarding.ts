// Dissolved into @openpanel/core's onboarding module (M6-003): the drip
// sequence (ONBOARDING_EMAILS) and the sweep itself moved to
// packages/core/src/modules/onboarding/onboarding.service.ts#runOnboardingCron.
// This file stays (DELEGATE PATTERN) — it is the `cron.ts` dispatcher's
// `onboarding` case, a thin wrapper around the core function, same shape as
// cron.delete.ts (M6-001).
import { runOnboardingCron } from '@openpanel/core';
import { logger } from '@/utils/logger';

export async function onboardingJob() {
  return await runOnboardingCron(logger);
}
