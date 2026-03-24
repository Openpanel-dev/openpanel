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
 * - If Mcp-Session-Id is present, routes to the existing session.
 * - Otherwise authenticates via token, creates a new session, and handles.
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
    const session = sessionManager.get(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found or expired' }));
      return;
    }
    await session.transport.handleRequest(req, res, body);
    return;
  }

  // New session — authenticate first
  const token = extractToken(query, req.headers.authorization);

  try {
    const context = await authenticateToken(token);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionManager.generateId(),
      onsessioninitialized: (id: string) => {
        sessionManager.set(id, {
          server,
          transport,
          context,
          lastActivity: Date.now(),
        });
        logger.info('MCP session initialized', {
          sessionId: id,
          clientType: context.clientType,
          organizationId: context.organizationId,
          projectId: context.projectId,
        });
      },
    });

    const server = createMcpServer(context);
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
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
 * Handle a GET /mcp request (SSE stream for an existing session).
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

  const session = sessionManager.get(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Session not found or expired' }));
    return;
  }

  try {
    await session.transport.handleRequest(req, res);
  } catch (err) {
    logger.error('MCP SSE stream error', { err, sessionId });
  }
}
