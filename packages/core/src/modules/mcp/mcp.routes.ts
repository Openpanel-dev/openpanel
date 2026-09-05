// MCP's stateless POST transport, mounted at `/mcp` (M5-007, ADR-015 entry
// 2). NAMED GAP, same as gsc.routes.ts / import.routes.ts / assistant.routes.ts:
// not yet reachable — main.ts does not mount `dashboardRoutes` until a real
// `AppDeps` exists (P3/P4/P8).
//
// `mcp.service` is loaded dynamically for the same reason assistant.routes.ts
// gives for `assistant.service`: a static top-level import here reaches
// `@openpanel/db`, which races `@openpanel/db`'s own circular
// `buffers/base-buffer.ts` -> `@openpanel/core` import.
//
// Rate limiting (V1: 60/min via Fastify's activateRateLimiter) is not wired
// here yet — nothing reaches this route until dashboardRoutes mounts, so it
// is a port task for whenever that happens, not a gap specific to MCP.
//
// The JSON-RPC body comes off the CONTEXT, not from `request.json()`: Elysia
// has already consumed the stream by the time the handler runs, and reading it
// twice throws "Body already used" (M9-004, caught by the auth contracts).

import { defineRoutes } from '../../http/define';

function loadMcpService() {
  return import('./mcp.service');
}

export const mcpRoutes = defineRoutes((app) =>
  app.post('/mcp', async ({ body, query, request, set }) => {
    const { extractToken, handleStatelessMcpRequest } = await loadMcpService();

    const token = extractToken(
      query as Record<string, string>,
      request.headers.get('authorization') ?? undefined
    );

    const { status, body: responseBody } = await handleStatelessMcpRequest(
      token,
      body
    );
    set.status = status;
    return responseBody;
  })
);
