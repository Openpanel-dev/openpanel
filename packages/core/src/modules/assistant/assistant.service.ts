// Moved from apps/api/src/agents/* (the Better Agent chat app + its tools,
// prompt and Prisma persistence) and packages/trpc/src/agents/filter-command.ts
// (M5-005, ADR-007's module map: assistant owns "S"). The bulk of the logic
// lives under ./src — this file is the module's public entry point, the same
// shape as insight.service.ts drawing from insight/src/*.
//
// V1 keeps running (DELEGATE PATTERN):
//   - apps/api/src/agents/app.ts and apps/api/src/agents/run-context.ts
//     become re-export shims of `getChatApp`/`getChatRunContext` below. The
//     live Fastify route (apps/api/src/app.ts) still mounts `chatApp` and
//     wraps the handler in `chatRunContext.run(...)` exactly as before.
//   - packages/trpc/src/routers/overview.ts's `runFilterCommand` procedure
//     now imports `runFilterCommand` from `@openpanel/core` instead of the
//     deleted `../agents/filter-command`.
//
// M10-004: `createAssistantService(deps)` lands here, which means THIS FILE
// is now statically imported by services.ts — every export below stays
// LAZY (dynamic `import()`) precisely because `./src/app.ts` constructs the
// whole Better Agent app (one `defineAgent` per whitelisted model) at its
// own import time, and `./src/filter-command.ts` reaches this package's own
// barrel. A static top-level `export ... from './src/app'` here would make
// `betterAgent`'s app construction run at PROCESS BOOT (services.ts's own
// module evaluation) instead of on the first real chat/filter request, and
// a static reach into `@openpanel/core` would risk re-entering this
// package's own barrel mid-evaluation (the exact TDZ hazard index.ts's
// header documents for `mcp.service.ts`). `deps` is unused: nothing here
// needs Postgres/ClickHouse/Redis directly — `./src/persistence.ts` reaches
// them through the v1-compat singleton (see that file's header), the same
// way every other bare, no-`Ctx` caller in this wave does.

import type { ServiceDeps, Services } from '../../services';
import type { PageContext } from './assistant.constants';

let _app: Promise<typeof import('./src/app')> | undefined;
function loadApp() {
  if (!_app) {
    _app = import('./src/app');
  }
  return _app;
}

let _runContext: Promise<typeof import('./src/run-context')> | undefined;
function loadRunContext() {
  if (!_runContext) {
    _runContext = import('./src/run-context');
  }
  return _runContext;
}

let _filterCommand: Promise<typeof import('./src/filter-command')> | undefined;
function loadFilterCommand() {
  if (!_filterCommand) {
    _filterCommand = import('./src/filter-command');
  }
  return _filterCommand;
}

export type { ChatApp } from './src/app';
export type { FilterCommandResult } from './src/filter-command';
export type { ChatRunContext } from './src/run-context';

export async function getChatApp() {
  return (await loadApp()).chatApp;
}

export async function getChatRunContext() {
  return (await loadRunContext()).chatRunContext;
}

export interface RunFilterCommandInput {
  query: string;
  projectId: string;
  pageContext?: PageContext;
  timezone: string;
}

export async function runFilterCommand(input: RunFilterCommandInput) {
  const { runFilterCommand: run } = await loadFilterCommand();
  return run(input);
}

/**
 * Ignores BOTH arguments, and takes them only because ADR-022 R3 keeps the
 * composition root a flat list: the three members are `@better-agent/core`
 * entry points with a fixed signature, and each reaches the database through
 * the v1-compat seam its own tools already use — there is nothing here to
 * hand a client to.
 */
export function createAssistantService(
  _deps: ServiceDeps,
  _services: () => Services
) {
  return {
    getChatApp,
    getChatRunContext,
    runFilterCommand,
  };
}
