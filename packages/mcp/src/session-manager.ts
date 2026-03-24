import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createLogger } from '@openpanel/logger';
import type { McpAuthContext } from './auth';

const logger = createLogger({ name: 'mcp:sessions' });

interface McpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  context: McpAuthContext;
  lastActivity: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

export class SessionManager {
  private sessions = new Map<string, McpSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      CLEANUP_INTERVAL_MS,
    );
    // Don't keep the process alive just for session cleanup
    this.cleanupTimer.unref();
  }

  generateId(): string {
    return randomUUID();
  }

  set(id: string, session: McpSession): void {
    this.sessions.set(id, session);
    logger.info('MCP session created', {
      sessionId: id,
      clientType: session.context.clientType,
      organizationId: session.context.organizationId,
      projectId: session.context.projectId,
    });
  }

  get(id: string): McpSession | undefined {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  async close(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;

    this.sessions.delete(id);

    try {
      await session.transport.close();
    } catch (err) {
      logger.warn('Error closing MCP transport', { sessionId: id, err });
    }

    logger.info('MCP session closed', { sessionId: id });
  }

  get size(): number {
    return this.sessions.size;
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > SESSION_TTL_MS) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      logger.info('MCP session expired', { sessionId: id });
      await this.close(id);
    }

    if (expired.length > 0) {
      logger.info('MCP session cleanup complete', {
        expired: expired.length,
        remaining: this.sessions.size,
      });
    }
  }

  async destroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const id of [...this.sessions.keys()]) {
      await this.close(id);
    }
  }
}
