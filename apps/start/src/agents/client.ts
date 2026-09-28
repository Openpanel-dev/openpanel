import { createClient } from '@better-agent/client';
import type { ChatApp } from '@openpanel/core';

/**
 * Typed Better Agent client. The `ChatApp` import surfaces every agent name,
 * every context schema, and every typed tool input — so `useAgent(client, {
 * agent: 'gpt-4-1' })` is autocompleted and validated end-to-end.
 *
 * About the import: `ChatApp = typeof chatApp` is the full Better
 * Agent-inferred application type, which inherently binds to the server-side
 * agent definition (models, tools, context). It can't be moved into
 * `@openpanel/core`'s assistant.constants without dragging the entire agent
 * definition (DB services, providers, etc.) along with it. It is type-only,
 * erased at build time — no runtime coupling, which is what keeps it inside
 * ADR-008's rule that only `*.constants.ts` may be VALUE-imported here. The
 * barrel is the only door: `@openpanel/core`'s exports map publishes `.` and
 * `./modules/*.constants`, and `ChatApp` cannot live in a constants file. The
 * shared schemas (context, client tool inputs, model whitelist) do live in
 * `@openpanel/core`'s assistant.constants, so this is the one type import that
 * crosses the app boundary — a second one past `AppRouter`, which ADR-022 R12
 * says should be the only one. Recorded as an open R12 finding: widening R12 to
 * `AppRouter` + `ChatApp` is an ADR amendment, not a code change.
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
