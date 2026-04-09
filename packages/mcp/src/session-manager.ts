import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createLogger } from '@openpanel/logger';
import { getRedisCache } from '@openpanel/redis';
import type { McpAuthContext } from './auth';

const logger = createLogger({ name: 'mcp:sessions' });

const SESSION_TTL_SECONDS = 30 * 60; // 30 minutes

function redisKey(id: string) {
  return `mcp:session:${id}`;
}

interface McpLocalSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

/**
 * Hybrid session manager:
 * - Auth context is stored in Redis (shared across all API instances, TTL 30 min)
 * - Active transport/server are kept in a local Map (in-process only — they hold live HTTP connections)
 *
 * This means POST requests can be handled by any instance: if the transport
 * isn't local, we retrieve the context from Redis and recreate it here.
 * SSE (GET) streams are inherently tied to the instance they started on;
 * when that instance goes down the client reconnects and gets a fresh session.
 */
export class SessionManager {
  private readonly local = new Map<string, McpLocalSession>();

  generateId(): string {
    return randomUUID();
  }

  // --- context (Redis) ---

  async setContext(id: string, context: McpAuthContext): Promise<void> {
    await getRedisCache().setJson(redisKey(id), SESSION_TTL_SECONDS, context);
    logger.info('MCP session context stored', {
      sessionId: id,
      clientType: context.clientType,
      organizationId: context.organizationId,
      projectId: context.projectId,
    });
  }

  getContext(id: string): Promise<McpAuthContext | null> {
    return getRedisCache().getJson<McpAuthContext>(redisKey(id));
  }

  async touchContext(id: string): Promise<void> {
    await getRedisCache().expire(redisKey(id), SESSION_TTL_SECONDS);
  }

  async deleteContext(id: string): Promise<void> {
    await getRedisCache().del(redisKey(id));
  }

  // --- transport/server (local) ---

  setLocal(id: string, session: McpLocalSession): void {
    this.local.set(id, session);
  }

  getLocal(id: string): McpLocalSession | undefined {
    return this.local.get(id);
  }

  deleteLocal(id: string): void {
    this.local.delete(id);
  }

  // --- combined ops ---

  async close(id: string): Promise<void> {
    const session = this.local.get(id);
    this.local.delete(id);
    await this.deleteContext(id);

    if (session) {
      try {
        await session.transport.close();
      } catch (err) {
        logger.warn('Error closing MCP transport', { sessionId: id, err });
      }
    }

    logger.info('MCP session closed', { sessionId: id });
  }

  async destroy(): Promise<void> {
    const ids = [...this.local.keys()];
    await Promise.all(ids.map((id) => this.close(id)));
  }

  get localSize(): number {
    return this.local.size;
  }
}
