import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createLogger } from '@openpanel/logger';
import { McpAuthError, authenticateToken, extractToken } from './auth';
import { createMcpServer } from './server';
import type { SessionManager } from './session-manager';

const logger = createLogger({ name: 'mcp:handler' });

/**
 * Handle a POST /mcp request.
 *
 * - If Mcp-Session-Id is present and the session is local: route to existing transport.
 * - If Mcp-Session-Id is present but not local: check Redis — if context found,
 *   recreate server+transport on this instance (cross-instance migration).
 * - Otherwise authenticate via token and create a new session.
 *
 * Writes directly to `res` (caller must have hijacked the Fastify reply).
 */
export async function handleMcpPost(
  sessionManager: SessionManager,
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  query: Record<string, unknown>,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId) {
    // Fast path: session is already on this instance
    const local = sessionManager.getLocal(sessionId);
    if (local) {
      await sessionManager.touchContext(sessionId);
      await local.transport.handleRequest(req, res, body);
      return;
    }

    // Slow path: session exists on another instance — retrieve context from Redis
    const context = await sessionManager.getContext(sessionId);
    if (!context) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found or expired' }));
      return;
    }

    logger.info('MCP session migrated to this instance', { sessionId });
    await attachSession(sessionManager, sessionId, context, req, res, body);
    return;
  }

  // New session — authenticate first
  const token = extractToken(query, req.headers.authorization);

  try {
    const context = await authenticateToken(token);
    await attachSession(sessionManager, null, context, req, res, body);
  } catch (err) {
    if (err instanceof McpAuthError) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    } else {
      logger.error('MCP session creation error', { err });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}

/**
 * Create (or recreate) a server+transport for the given context, handle the
 * request, and register the session locally + in Redis.
 *
 * @param fixedSessionId  When migrating an existing session, pass its ID so we
 *                        reuse the same session ID rather than generating a new one.
 */
async function attachSession(
  sessionManager: SessionManager,
  fixedSessionId: string | null,
  context: Parameters<typeof createMcpServer>[0],
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
): Promise<void> {
  const server = createMcpServer(context);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: fixedSessionId
      ? () => fixedSessionId
      : () => sessionManager.generateId(),
    onsessioninitialized: async (id: string) => {
      sessionManager.setLocal(id, { server, transport });
      await sessionManager.setContext(id, context);
      logger.info('MCP session initialized', {
        sessionId: id,
        clientType: context.clientType,
        organizationId: context.organizationId,
        projectId: context.projectId,
      });
    },
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

/**
 * Handle a GET /mcp request (SSE stream for an existing session).
 *
 * SSE streams are tied to the instance they started on. If the session is not
 * local (i.e., it was started on a different instance), return 404 so the
 * client reconnects and establishes a fresh session on this instance.
 */
export async function handleMcpGet(
  sessionManager: SessionManager,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Mcp-Session-Id header is required' }));
    return;
  }

  const session = sessionManager.getLocal(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Session not found on this instance — reconnect to start a new session',
      }),
    );
    return;
  }

  try {
    await session.transport.handleRequest(req, res);
  } catch (err) {
    logger.error('MCP SSE stream error', { err, sessionId });
  }
}
