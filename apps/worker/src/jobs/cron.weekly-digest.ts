// Dissolved into @openpanel/core's insight module (M5-001): the digest
// assembly, narrative call and send loop moved to
// packages/core/src/modules/insight/insight.service.ts. This file stays
// (DELEGATE PATTERN) — it is the `weeklyDigest` case of `cron.ts`'s
// dispatcher, and `previewWeeklyDigestForProject` backs boot-debug.ts's
// single-project preview route.
import { previewWeeklyDigest, sendWeeklyDigests } from '@openpanel/core';
import { logger as baseLogger } from '@/utils/logger';

const logger = baseLogger.child({ job: 'weekly-digest' });

export async function weeklyDigestCronJob() {
  await sendWeeklyDigests(logger);
}

/**
 * Debug/testing helper for a SINGLE project, bypassing eligibility.
 *   - opts.to    → send only to that address (safe for testing)
 *   - no opts.to → assemble and return the payload without sending (preview)
 *   - opts.force → build even if the project had 0 visitors this week
 */
export async function previewWeeklyDigestForProject(
  projectId: string,
  opts: { to?: string; force?: boolean } = {}
) {
  return previewWeeklyDigest(projectId, opts);
}
