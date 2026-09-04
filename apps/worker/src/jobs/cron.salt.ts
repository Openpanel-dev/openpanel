// Dissolved into @openpanel/core's salt module (M8-004): rotation logic
// moved to packages/core/src/modules/salt/salt.service.ts#rotateSalt. This
// file stays (DELEGATE PATTERN) — it is `cron.ts`'s dispatcher `salt` case,
// a thin wrapper around the core function, same shape as `cron.delete.ts`
// (M6-001).
import { rotateSalt } from '@openpanel/core';

export async function salt() {
  return await rotateSalt();
}
