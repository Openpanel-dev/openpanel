// Registration-allowed policy lives in @openpanel/core now (M8-005):
// packages/core/src/modules/auth/src/registration.ts. Re-exported here for
// existing `@openpanel/db` importers (core's auth.service.ts, which
// dynamic-imports this exact specifier to keep one dynamic edge per import
// cycle) — same shape as event.service.ts since M7-002.
export { getIsRegistrationAllowed } from '@openpanel/core';
