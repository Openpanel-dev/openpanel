// Dissolved into @openpanel/core's assistant module (M5-005): the Better
// Agent app definition (one agent per allowed model, the Prisma-backed
// conversation store, the titler agent) moved to
// packages/core/src/modules/assistant/src/app.ts. This file stays
// (DELEGATE PATTERN) — apps/api/src/app.ts is the live Fastify route and
// keeps calling `getChatApp()` from here unchanged.
//
// `getChatApp` is a lazy accessor, not a plain value export — see
// @openpanel/core's index.ts for why a static import here would race
// @openpanel/db's own circular buffers/base-buffer.ts import.
export { type ChatApp, getChatApp } from '@openpanel/core';
