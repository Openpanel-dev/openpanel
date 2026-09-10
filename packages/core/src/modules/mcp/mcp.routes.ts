// MCP's stateless POST transport, mounted at `/mcp` (M5-007, ADR-015 entry 2).
//
// `ctx.services.mcp` carries this module's factory the same as every other
// module now (M10-004) — `mcp.service.ts`'s own header explains why that
// file is now safe to reach through `ctx.services` instead of this route's
// former one-off `loadMcpService()`.
//
// OPEN GAP: V1's 60/min rate limit (Fastify's activateRateLimiter) is still
// not ported, and the route IS live — `apps/api/src/main.ts` mounts
// `dashboardRoutes` for every non-worker role. So an unauthenticated caller
// can drive one argon2 verify per request: `src/auth.ts` caches a *correct*
// secret for 5 minutes under a key containing that secret's hash, which a
// wrong secret misses every time. Porting the limiter is a task for whoever
// owns the HTTP surface; nothing in this module can do it.
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
