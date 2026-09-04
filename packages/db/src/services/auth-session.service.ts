// The Postgres-backed login session CRUD lives in @openpanel/core now
// (M8-005): packages/core/src/modules/auth/src/login-session.ts. Re-exported
// here for existing `@openpanel/db` importers (apps/api's app.ts) — same
// shape as packages/db/src/services/chart.service.ts since M7-003.
export type { SessionValidationResult } from '@openpanel/core';
export {
  createDemoSession,
  createSession,
  EMPTY_SESSION,
  invalidateSession,
  validateSessionToken,
} from '@openpanel/core';
