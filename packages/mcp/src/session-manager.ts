import { randomUUID } from 'node:crypto';
import { createLogger } from '@openpanel/logger';
import { getRedisCache } from '@openpanel/redis';
import type { McpAuthContext } from './auth';

const logger = createLogger({ name: 'mcp:sessions' });

const SESSION_TTL_SECONDS = 30 * 60; // 30 minutes

function redisKey(id: string) {
  return `mcp:session:${id}`;
}

/**
 * Stateless session manager — auth context lives only in Redis.
 *
 * No in-process state: any API instance can handle any request for any session.
 * No sticky sessions required.
 */
export class SessionManager {
  generateId(): string {
    return randomUUID();
  }

  async setContext(id: string, context: McpAuthContext): Promise<void> {
    await getRedisCache().setJson(redisKey(id), SESSION_TTL_SECONDS, context);
    logger.info(
      {
        sessionId: id,
        clientType: context.clientType,
        organizationId: context.organizationId,
        projectId: context.projectId,
      },
      'MCP session context stored',
    );
  }

  getContext(id: string): Promise<McpAuthContext | null> {
    return getRedisCache().getJson<McpAuthContext>(redisKey(id));
  }

  async touchContext(id: string): Promise<void> {
    await getRedisCache().expire(redisKey(id), SESSION_TTL_SECONDS);
  }

  async deleteContext(id: string): Promise<void> {
    await getRedisCache().del(redisKey(id));
    logger.info({ sessionId: id }, 'MCP session deleted');
  }

  async close(id: string): Promise<void> {
    await this.deleteContext(id);
  }

  async destroy(): Promise<void> {
    // No-op: sessions are in Redis, not in-process
  }
}
