import { createClient } from '@better-agent/client';
import type { ChatApp } from '@openpanel/core';

/**
 * Typed Better Agent client. The `ChatApp` import surfaces every
 * agent name, every context schema, and every typed tool input — so
 * `useAgent(client, { agent: 'gpt-4-1' })` is autocompleted and
 * validated end-to-end.
 *
 * About the import: `ChatApp = typeof chatApp` is the full Better
 * Agent-inferred application type, which inherently binds to the
 * server-side agent definition (models, tools, context). It can't be
 * moved into `@openpanel/validation` without dragging the entire agent
 * definition (DB services, providers, etc.) along with it. It is
 * type-only, erased at build time — no runtime coupling, which is what
 * keeps it inside ADR-008's rule that only `*.constants.ts` may be
 * VALUE-imported here. It used to reach `apps/api/src/agents/app`
 * relatively; M9-004 deleted that wrapper and core's barrel exports the
 * type. The shared schemas (context, client tool inputs, model
 * whitelist) live in `@openpanel/validation` so only this one type
 * import crosses the app boundary.
 */
export type AppClient = ReturnType<typeof createClient<ChatApp>>;

let cachedClient: AppClient | null = null;
let cachedBaseURL: string | null = null;

/**
 * Get-or-create the typed Better Agent client. Memoized per `apiUrl` so
 * we don't rebuild on every render. We wrap `fetch` to force
 * `credentials: 'include'` on every request — the auth plugin guard on
 * the server reads the session cookie from the request.
 */
export function getChatClient(apiUrl: string): AppClient {
  if (cachedClient && cachedBaseURL === apiUrl) {
    return cachedClient;
  }
  cachedBaseURL = apiUrl;
  cachedClient = createClient<ChatApp>({
    baseURL: `${apiUrl}/ai/agents`,
    fetch: (input, init) => fetch(input, { ...init, credentials: 'include' }),
  });
  return cachedClient;
}
