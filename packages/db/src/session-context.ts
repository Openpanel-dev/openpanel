// The ALS session scope lives in @openpanel/core now (M7-001):
// packages/core/src/modules/session/src/session-context.ts. Re-exported here
// so V1 (`packages/trpc`, `apps/api`) and core share the ONE
// AsyncLocalStorage instance — two stores would never see each other's
// session id. `session-consistency.ts`, its one other V1 reader, is deleted
// (M8-004, ADR-012: the read-replica extension it backed is never wired into
// the Prisma client, and Carl ruled both out — docs/ANSWERS.md §1.5).
export { als, getAlsSessionId, runWithAlsSession } from '@openpanel/core';
