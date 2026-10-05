import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context set by `assistant.routes.ts` after its access checks, read
 * by the persistence store and the date-range/prompt code. AsyncLocalStorage
 * because Better Agent's `onBeforeSave` hook does not expose the agent `context`.
 */
export type ChatRunContext = {
  userId: string;
  projectId: string;
  organizationId: string;
  /** Project's configured timezone (IANA). Defaults to `UTC`. */
  timezone: string;
};

export const chatRunContext = new AsyncLocalStorage<ChatRunContext>();
