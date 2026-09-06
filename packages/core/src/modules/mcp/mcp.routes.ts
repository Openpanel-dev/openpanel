// MCP's stateless POST transport, mounted at `/mcp` (M5-007, ADR-015 entry
// 2). NAMED GAP, same as gsc.routes.ts / import.routes.ts / assistant.routes.ts:
// not yet reachable — main.ts does not mount `dashboardRoutes` until a real
// `AppDeps` exists (P3/P4/P8).
//
// `ctx.services.mcp` carries this module's factory the same as every other
// module now (M10-004) — `mcp.service.ts`'s own header explains why that
// file is now safe to reach through `ctx.services` instead of this route's
// former one-off `loadMcpService()`.
//
// Rate limiting (V1: 60/min via Fastify's activateRateLimiter) is not wired
// here yet — nothing reaches this route until dashboardRoutes mounts, so it
// is a port task for whenever that happens, not a gap specific to MCP.
//
// The JSON-RPC body comes off the CONTEXT, not from `request.json()`: Elysia
// has already consumed the stream by the time the handler runs, and reading it
// twice throws "Body already used" (M9-004, caught by the auth contracts).

import { defineRoutes } from '../../http/define';

export const mcpRoutes = defineRoutes((app) =>
  app.post('/mcp', async ({ body, ctx, query, request, set }) => {
    const token = ctx.services.mcp.extractToken(
      query as Record<string, string>,
      request.headers.get('authorization') ?? undefined
    );

    const { status, body: responseBody } =
      await ctx.services.mcp.handleStatelessMcpRequest(token, body);
    set.status = status;
    return responseBody;
  })
);
