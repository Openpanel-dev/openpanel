// The ALS session scope lives in @openpanel/core now (M7-001):
// packages/core/src/modules/session/src/session-context.ts. Re-exported here
// so V1 (`packages/trpc`, `apps/api`, session-consistency.ts) and core share
// the ONE AsyncLocalStorage instance — two stores would never see each
// other's session id.
export { als, getAlsSessionId, runWithAlsSession } from '@openpanel/core';
