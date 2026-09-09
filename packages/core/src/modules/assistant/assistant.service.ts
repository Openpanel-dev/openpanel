// Moved from apps/api/src/agents/* (the Better Agent chat app + its tools,
// prompt and Prisma persistence) and packages/trpc/src/agents/filter-command.ts
// (M5-005, ADR-007's module map: assistant owns "S"). The bulk of the logic
// lives under ./src — this file is the module's public entry point, the same
// shape as insight.service.ts drawing from insight/src/*.
//
// M15-003: every export takes `deps`. `./src/app.ts` and
// `./src/filter-command.ts` construct nothing at import time any more, so the
// three lazy loaders that used to stand between this file and them are gone
// (ADR-022 R6/R15) — a static import here builds no agent, opens no provider
// client and reaches no database.
//
// The chat app is memoized PER `deps` object rather than per process: a Ctx
// builds one `ServiceDeps` per unit of work (context.ts's
// `installLazyServices`), so two calls inside one chat request share an app
// while two requests do not — the same trade `cacheable-per-deps.ts`
// records for the cross-module caches.

import type { ServiceDeps, Services } from '../../services';
import type { PageContext } from './assistant.constants';
import { type ChatApp, createChatApp } from './src/app';
import { runFilterCommand } from './src/filter-command';
import { chatRunContext } from './src/run-context';

export type { ChatApp } from './src/app';
export type { FilterCommandResult } from './src/filter-command';
export type { ChatRunContext } from './src/run-context';

const appsByDeps = new WeakMap<ServiceDeps, ChatApp>();

function chatAppFor(deps: ServiceDeps): ChatApp {
  const existing = appsByDeps.get(deps);
  if (existing) {
    return existing;
  }
  const built = createChatApp(deps);
  appsByDeps.set(deps, built);
  return built;
}

export interface RunFilterCommandInput {
  query: string;
  projectId: string;
  pageContext?: PageContext;
  timezone: string;
}

export function createAssistantService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    getChatApp: (): ChatApp => chatAppFor(deps),
    getChatRunContext: (): typeof chatRunContext => chatRunContext,
    runFilterCommand: (
      input: RunFilterCommandInput
    ): ReturnType<typeof runFilterCommand> => runFilterCommand(deps, input),
  };
}
