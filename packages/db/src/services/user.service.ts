// The user service lives in @openpanel/core now (M6-001). Re-exported here
// for existing `@openpanel/db` importers (packages/trpc's auth/onboarding
// routers, not yet ported) — same shape as packages/db/src/gsc.ts since
// M5-002.
export type { IServiceUser } from '@openpanel/core';
export { getUserAccount, getUserById } from '@openpanel/core';
