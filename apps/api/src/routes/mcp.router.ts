// Dissolved into @openpanel/core's mcp module (M5-007): auth, tool
// dispatch and the streamable-HTTP protocol handling moved to
// packages/core/src/modules/mcp/mcp.service.ts#handleStatelessMcpRequest.
// This router stays (DELEGATE PATTERN) for rate limiting and the generic
// 500 catch — everything protocol-shaped is core's.
//
// ADR-015 entry 2 (accepted): MCP is stateless-POST only. GET/SSE, DELETE
// and the Redis session store (`mcp:session:<uuid>`, the `Mcp-Session-Id`
// header) are REMOVED here, not delegated — MCP is the one module this wave
// is allowed to change the endpoint surface of.
import { handleMcpRequest } from '@openpanel/core';
import type { FastifyPluginAsync } from 'fastify';
import { activateRateLimiter } from '@/utils/rate-limiter';

const mcpRouter: FastifyPluginAsync = async (fastify) => {
  await activateRateLimiter({ fastify, max: 60, timeWindow: '1 minute' });

  /**
   * POST /mcp
   *
   * Every request authenticates via ?token= query param or Authorization:
   * Bearer and runs on a fresh, per-request MCP server — no session, no
   * sticky-instance requirement.
   */
  await fastify.post('/', async (req, reply) => {
    try {
      const { status, body } = await handleMcpRequest(
        req.query as Record<string, unknown>,
        req.headers.authorization,
        req.body
      );
      return reply.status(status).send(body);
    } catch (err) {
      req.log.error({ err }, 'MCP request processing error');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};

export default mcpRouter;
