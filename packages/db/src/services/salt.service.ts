// Moved to @openpanel/core (M8-004): packages/core/src/modules/salt/salt.service.ts.
// Re-exported here so V1's apps/worker (createInitialSalts at boot) and
// apps/api's event.controller.ts (getSalts) keep working unchanged
// (DELEGATE PATTERN) — V1 is not deleted before P9. `rotateSalt` is V1's
// `cron.salt.ts`'s `salt()`, re-exported under its core name for the one
// caller that still imports this file directly rather than the barrel.
export { createInitialSalts, getSalts, rotateSalt } from '@openpanel/core';
