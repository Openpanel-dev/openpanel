import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context for chat runs. Populated by the Fastify route
 * wrapper (which validates the session + project access) before the
 * Better Agent handler runs, and read by:
 *   - the persistence store, to upsert the `Conversation` row with
 *     the right owner on first save
 *   - `resolveDateRange` / the prompt builder, to turn page-context
 *     range presets (`"6m"`, `"7d"`, …) into actual dates in the
 *     user's project timezone
 *
 * Using AsyncLocalStorage means we don't have to thread these values
 * through Better Agent's plugin hooks — which don't expose the agent
 * `context` field to `onBeforeSave`.
 */
export type ChatRunContext = {
  userId: string;
  projectId: string;
  organizationId: string;
  /** Project's configured timezone (IANA). Defaults to `UTC`. */
  timezone: string;
};

export const chatRunContext = new AsyncLocalStorage<ChatRunContext>();
