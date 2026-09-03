// Moved from apps/api/src/agents/* (the Better Agent chat app + its tools,
// prompt and Prisma persistence) and packages/trpc/src/agents/filter-command.ts
// (M5-005, ADR-007's module map: assistant owns "S"). The bulk of the logic
// lives under ./src — this file is the module's public entry point, the same
// shape as insight.service.ts drawing from insight/src/*.
//
// V1 keeps running (DELEGATE PATTERN):
//   - apps/api/src/agents/app.ts and apps/api/src/agents/run-context.ts
//     become re-export shims of `chatApp`/`chatRunContext` below. The live
//     Fastify route (apps/api/src/app.ts) still mounts `chatApp` and wraps
//     the handler in `chatRunContext.run(...)` exactly as before.
//   - packages/trpc/src/routers/overview.ts's `runFilterCommand` procedure
//     now imports `runFilterCommand` from `@openpanel/core` instead of the
//     deleted `../agents/filter-command`.
export type { ChatApp } from './src/app';
export { chatApp } from './src/app';
export type { FilterCommandResult } from './src/filter-command';
export { runFilterCommand } from './src/filter-command';
export type { ChatRunContext } from './src/run-context';
export { chatRunContext } from './src/run-context';
