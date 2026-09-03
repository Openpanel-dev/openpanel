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

import { defineRoutes } from '../../http/define';

function loadMcpService() {
  return import('./mcp.service');
}

export const mcpRoutes = defineRoutes((app) =>
  app.post('/mcp', async ({ request, set }) => {
    const { extractToken, handleStatelessMcpRequest } = await loadMcpService();

    const url = new URL(request.url);
    const token = extractToken(
      Object.fromEntries(url.searchParams),
      request.headers.get('authorization') ?? undefined
    );
    const body = await request.json();

    const { status, body: responseBody } = await handleStatelessMcpRequest(
      token,
      body
    );
    set.status = status;
    return responseBody;
  })
);
