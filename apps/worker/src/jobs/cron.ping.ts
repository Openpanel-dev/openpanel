// Dissolved into @openpanel/core's misc module (M7-008): the outbound
// telemetry sweep moved to
// packages/core/src/modules/misc/misc.service.ts#runPingCron. This file
// stays (DELEGATE PATTERN) — it is `cron.ts`'s dispatcher `ping` case, a thin
// wrapper around the core function, same shape as `cron.delete.ts` (M6-001).
import { runPingCron } from '@openpanel/core';

export async function ping() {
  return await runPingCron();
}
