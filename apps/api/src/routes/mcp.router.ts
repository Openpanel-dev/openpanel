import { McpAuthError, authenticateToken, extractToken, handleMcpGet, handleMcpPost, SessionManager } from '@openpanel/mcp';
import type { FastifyPluginAsync } from 'fastify';
import { activateRateLimiter } from '@/utils/rate-limiter';

/**
 * Singleton session manager — lives for the lifetime of the API process.
 * Exported so graceful shutdown can clean it up.
 */
export const mcpSessionManager = new SessionManager();

const mcpRouter: FastifyPluginAsync = async (fastify) => {
  await activateRateLimiter({ fastify, max: 60, timeWindow: '1 minute' });

  /**
   * POST /mcp
   *
   * Handles both session initialization (no Mcp-Session-Id header) and
   * subsequent JSON-RPC messages within an existing session.
   *
   * First request: authenticate via ?token= query param or Authorization: Bearer.
   * Subsequent requests: route by Mcp-Session-Id header.
   */
  await fastify.post('/', async (req, reply) => {
    // Hand off full response control to the MCP transport
    reply.hijack();
    await handleMcpPost(
      mcpSessionManager,
      req.raw,
      reply.raw,
      req.body,
      req.query as Record<string, unknown>,
    );
  });

  /**
   * GET /mcp
   *
   * Establishes an SSE stream for server-to-client notifications.
   * Requires Mcp-Session-Id header from a previously initialized session.
   */
  await fastify.get('/', async (req, reply) => {
    reply.hijack();
    await handleMcpGet(mcpSessionManager, req.raw, reply.raw);
  });

  /**
   * DELETE /mcp
   *
   * Explicitly close an MCP session and free its resources.
   * Requires the same auth token used to create the session — verified against
   * the session's organizationId to prevent one client closing another's session.
   */
  await fastify.delete('/', async (req, reply) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      return reply.status(400).send({ error: 'Mcp-Session-Id header is required' });
    }

    const token = extractToken(req.query as Record<string, unknown>, req.headers.authorization);
    let callerContext;
    try {
      callerContext = await authenticateToken(token);
    } catch (err) {
      return reply.status(401).send({ error: err instanceof McpAuthError ? err.message : 'Unauthorized' });
    }

    const context = await mcpSessionManager.getContext(sessionId);
    if (!context) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    if (context.organizationId !== callerContext.organizationId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await mcpSessionManager.close(sessionId);
    return reply.status(200).send({ ok: true });
  });
};

export default mcpRouter;
