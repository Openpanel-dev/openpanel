// Dissolved into @openpanel/core's insight module (M5-001): the retention
// rules moved to
// packages/core/src/modules/insight/insight.service.ts#cleanupStaleInsights.
// This file stays (DELEGATE PATTERN) — it is the `insightCleanup` case of
// `cron.ts`'s dispatcher.
import { cleanupStaleInsights } from '@openpanel/core';
import { logger as baseLogger } from '@/utils/logger';

const logger = baseLogger.child({ job: 'insight-cleanup' });

export async function insightCleanupCronJob() {
  await cleanupStaleInsights(logger);
}
