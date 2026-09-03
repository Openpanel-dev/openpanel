// Dissolved into @openpanel/core's organization module (M6-001): the
// deletion sweep itself, plus packages/db/src/services/delete.service.ts,
// moved to
// packages/core/src/modules/organization/organization.service.ts#runDeleteCron.
// This file stays (DELEGATE PATTERN) — it is the `cron.ts` dispatcher's
// `delete` case, a thin wrapper around the core function, same shape as
// gsc.ts's `gscSyncAllJob` (M5-002).
import { runDeleteCron } from '@openpanel/core';
import { logger } from '@/utils/logger';

export async function jobDelete() {
  const result = await runDeleteCron();
  logger.info(result, 'Delete cron complete');
}
