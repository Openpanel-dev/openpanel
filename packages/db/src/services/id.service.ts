// Slug-based id generation lives in @openpanel/core now (M8-005):
// packages/core/src/shared/slug-id.ts. Re-exported here for existing
// `@openpanel/db` importers (core's dashboard/project/onboarding services,
// which deep-import this exact specifier via dynamic import) — same shape as
// event.service.ts since M7-002.
export { getId } from '@openpanel/core';
