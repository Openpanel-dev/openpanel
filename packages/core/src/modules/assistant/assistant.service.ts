// The chat app is memoized per `deps` object, not per process: a Ctx builds one
// `ServiceDeps` per unit of work, so calls inside one chat request share an app
// and separate requests do not.

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
