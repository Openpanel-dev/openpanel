// Dissolved into @openpanel/core's assistant module (M5-005): the
// AsyncLocalStorage carrying per-request chat context moved to
// packages/core/src/modules/assistant/src/run-context.ts. This file stays
// (DELEGATE PATTERN) — apps/api/src/app.ts wraps the live `/ai/agents/*`
// handler in `chatRunContext.run(...)`, and the core-side persistence store
// reads the SAME singleton (resolved once via `getChatRunContext()`, see
// @openpanel/core's index.ts for why it is a lazy accessor rather than a
// plain value export).
export { type ChatRunContext, getChatRunContext } from '@openpanel/core';
